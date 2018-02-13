/*
	Fractal zoomer written in javascript
	https://github.com/xyzzy/jsFractalZoom

	Copyright 2018 https://github.com/xyzzy

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published
	by the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

/*
 * Timing considerations
 *
 * Constructing a frame is a time consuming process that would severely impair the event/messaging queues and vsync.
 * To make the code more responsive, frame constructing is split into 3 phases:
 * - COPY, pre-fill a frame with data from a previous frame.
 * 	The time required depends on window size and magnification factor (zoom speed).
 * 	Times are unstable and can vary between 1 and 15mSec, typically 15mSec
 * - PAINT, Create RGBA imagedata ready to be written to DOM canvas
 * 	The time required depends on window size and rotation angle.
 * 	Times are fairly stable and can vary between 5 and 15mSec, typically 12mSec.
 * - UPDATE, improve quality by recalculating inaccurate pixels
 * 	The time required depends on window size and magnification factor.
 * 	Times are fairly short, typically well under 1mSec.
 * 	In contrast to COPY/PAINT which are called once and take long
 * 	UPDATES are many and take as short as possible to keep the system responsive.
 *
 * There is also an optional embedded IDLE state. No calculations are performed 2mSec before a vsync,
 * so that the event/message queues are highly responsive to the handling of requestAnimationFrame()
 * for worst case situations that a long UPDATE will miss the vsync.
 *
 * IDLEs may be omitted if updates are fast enough.
 *
 * There are also 2 sets of 2 alternating buffers, internal pixel data and context2D RGBA data.
 *
 * Read/write time diagram: R=Read, W=write, I=idle, rAF=requestAnimationFrame, AF=animationFrameCallback
 *
 *               COPY0  UPDATE0    PAINT0   COPY1  UPDATE1  PAINT1  COPY0  UPDATE0  PAINT0
 * pixel0:      <--W--> WWWWIIWWWW <--R--> <--R-->                 <--W--> WWWWIIW <--R-->
 * imagedata0               .      <--W-->                                     .   <--W-->
 * pixel1       <--R-->     .              <--W--> WWWWIIW <--R--> <--R-->     .
 * imagedata1:              .                          .   <--W-->             .
 *                          ^wait-for-vsync            ^wait-for-vsync         ^wait-for-vsync
 *                           ^rAF                       ^rAF                    ^rAF
 *                                 ^AF imagedata1          ^AF imagedata0          ^AF imagedata1
 *
 * The rAF callback should signal the start of the next PAINT stage. Starting the next phase directly
 * after rAF() would cause the callback to wait for the phase completion which would take at least 5mSec.
 *
 * The vsync also calculates zoom and angle for the next frame based on elapsed time so
 * dropped frames will not cause glitches. Frame timing may be off, but movement should be on.
 */

"use strict";

/*
 * Globals settings and values
 *
 * @constructor
 */
function Config() {

	/*
	 * GUI settings
	 */
	this.power = false;
	this.autoPilot = false;

	/** @member {number} - zoom magnification slider Min */
	this.magnificationMin = 1.0;
	/** @member {number} - zoom magnification slider Max */
	this.magnificationMax = 1000.0;
	/** @member {number} - zoom magnification slider Now */
	this.magnificationNow = this.logTolinear(this.magnificationMin, this.magnificationMax, 1000);

	/** @member {number} - rotate speed slider Min */
	this.rotateSpeedMin = -0.5;
	/** @member {number} - rotate speed slider Max */
	this.rotateSpeedMax = +0.5;
	/** @member {number} - rotate speed slider Now */
	this.rotateSpeedNow = 0;

	/** @member {number} - palette cycle slider Min */
	this.paletteSpeedMin = -30.0;
	/** @member {number} - palette cycle slider Max */
	this.paletteSpeedMax = +30.0;
	/** @member {number} - palette cycle slider Now */
	this.paletteSpeedNow = 0;

	/** @member {number} - calculation depth slider Min */
	this.depthMin = 30;
	/** @member {number} - calculation depth slider Max */
	this.depthMax = 1500;
	/** @member {number} - calculation depth slider Now */
	this.depthNow = 1200;

	/** @member {number} - calculation depth slider Min */
	this.framerateMin = 1;
	/** @member {number} - calculation depth slider Max */
	this.framerateMax = 60;
	/** @member {number} - calculation depth slider Now */
	this.framerateNow = 20;

	/** @member {number} - center X coordinate */
	this.centerX = 0;
	/** @member {number} - center Y coordinate */
	this.centerY = 0;
	/** @member {number} - distance between center and viewport corner */
	this.radius = 0;
	/** @member {number} - current viewport angle (degrees) */
	this.angle = 0;

	/** @member {number} - current palette offset */
	this.paletteOffset = 0; // color palette cycle timer updated

	/** @member {number} - current viewport zoomspeed */
	this.zoomSpeed = 0;
	/** @member {number} - After 1sec, get 80% closer to target speed */
	this.zoomSpeedCoef = 0.80;

	this.formula = "";
	this.incolour = "";
	this.outcolour = "";
	this.plane = "";

	/** @member {number} */
	this.autopilotX = 0;
	/** @member {number} */
	this.autopilotY = 0;
	/** @member {number} */
	this.autopilotButtons = 0;

	}

/**
 *  Slider helper, convert linear value `now` to logarithmic
 *
 * @param {number} min
 * @param {number} max
 * @param {number} now
 * @returns {number}
 */
Config.prototype.linearToLog = function(min, max, now) {

	var v = Math.exp((now - min) / (max - min)); // 1 <= result <= E

	return min + (max - min) * (v - 1) / (Math.E - 1);

};

/**
 *  Slider helper, convert logarithmic value `now` to linear
 *
 * @param {number} min
 * @param {number} max
 * @param {number} now
 * @returns {number}
 */
Config.prototype.logTolinear = function(min, max, now) {

	var v = 1 + (now - min) * (Math.E - 1) / (max - min);

	return min + Math.log(v) * (max - min);
};

function Palette()
{
	/** member {Uint8Array} */
	this.red = undefined;
	/** member {Uint8Array} */
	this.green = undefined;
	/** member {Uint8Array} */
	this.blue = undefined;

	this.backgroundRed = 0;
	this.backgroundGreen = 0;
	this.backgroundBlue = 0;

	this.random = function(n) {
		return Math.floor(Math.random() * n);
	};

	this.mksmooth = function(nsegments, segmentsize, R, G, B) {
		var i, j, k;

		this.red = new Uint8Array(nsegments * segmentsize);
		this.green = new Uint8Array(nsegments * segmentsize);
		this.blue = new Uint8Array(nsegments * segmentsize);

		k = 0;
		for (i = 0; i < nsegments; i++) {

			var r = R[i % nsegments];
			var g = G[i % nsegments];
			var b = B[i % nsegments];
			var rs = (R[(i + 1) % nsegments] - r) / segmentsize;
			var gs = (G[(i + 1) % nsegments] - g) / segmentsize;
			var bs = (B[(i + 1) % nsegments] - b) / segmentsize;

			for (j = 0; j < segmentsize; j++) {

				this.red[k] = Math.floor(r);
				this.green[k] = Math.floor(g);
				this.blue[k] = Math.floor(b);
				k++;

				r += rs;
				g += gs;
				b += bs;
			}
		}
	};

	this.randomize_segments1 = function(whitemode, nsegments, segmentsize)
	{
		var i;
		var R = new Array(nsegments);
		var G = new Array(nsegments);
		var B = new Array(nsegments);

		if (whitemode) {
			R[0] = 255;
			G[0] = 255;
			B[0] = 255;
			for (i = 0; i < nsegments; i += 2) {
				if (i !== 0) {
					R[i] = this.random(256);
					G[i] = this.random(256);
					B[i] = this.random(256);
				}
				if (i + 1 < nsegments) {
					R[i + 1] = this.random(35);
					G[i + 1] = this.random(35);
					B[i + 1] = this.random(35);
				}
			}
		} else {
			for (i = 0; i < nsegments; i += 2) {
				R[i] = this.random(35);
				G[i] = this.random(35);
				B[i] = this.random(35);
				if (i + 1 < nsegments) {
					R[i + 1] = this.random(256);
					G[i + 1] = this.random(256);
					B[i + 1] = this.random(256);
				}
			}
		}

		this.mksmooth(nsegments, segmentsize, R, G, B);
	};

	this.randomize_segments2 = function(whitemode, nsegments, segmentsize)
	{
		var R = new Array(nsegments);
		var G = new Array(nsegments);
		var B = new Array(nsegments);

		for (var i=0; i<nsegments; i++) {
			R[i] = (!whitemode) * 255;
			G[i] = (!whitemode) * 255;
			B[i] = (!whitemode) * 255;
			if (++i >= nsegments)
				break;
			R[i] = this.random(256);
			G[i] = this.random(256);
			B[i] = this.random(256);
			if (++i >= nsegments)
				break;
			R[i] = whitemode * 255;
			G[i] = whitemode * 255;
			B[i] = whitemode * 255;
		}

		this.mksmooth(nsegments, segmentsize, R, G, B);
	};

	this.randomize_segments3 = function(whitemode, nsegments, segmentsize) {
		var h, s, v, i;
		var R = new Array(nsegments);
		var G = new Array(nsegments);
		var B = new Array(nsegments);

		for (i = 0; i < nsegments; i++) {
			if (i % 6 === 0) {
				R[i] = G[i] = B[i] = 0;
			} else if (i % 3 === 0) {
				R[i] = G[i] = B[i] = 255;
			} else {
				s = this.random(256);
				h = this.random(128 - 32);
				v = this.random(128);
				if ((i % 6 > 3) ^ (i % 3 === 1)) {
					h += 42 + 16;
				} else {
					h += 42 + 128 + 16;
					v += 128 + 64;
				}
				h %= 256;
				v %= 256;

				// hsv to rgb
				if (s === 0) {
					R[i] = G[i] = B[i] = v;
				} else {
					var hue = h * 6;

					var f = hue & 255;
					var p = v * (256 - s) >> 8;
					var q = v * (256 - ((s * f) >> 8)) >> 8;
					var t = v * (256 * 256 - (s * (256 - f))) >> 16;
					switch (Math.floor(hue / 256)) {
						case 0:
							R[i] = v;
							G[i] = t;
							B[i] = p;
							break;
						case 1:
							R[i] = q;
							G[i] = v;
							B[i] = p;
							break;
						case 2:
							R[i] = p;
							G[i] = v;
							B[i] = t;
							break;
						case 3:
							R[i] = p;
							G[i] = q;
							B[i] = v;
							break;
						case 4:
							R[i] = t;
							G[i] = p;
							B[i] = v;
							break;
						case 5:
							R[i] = v;
							G[i] = p;
							B[i] = q;
							break;
					}
				}

			}
		}
		this.mksmooth(nsegments, segmentsize, R, G, B);
	};

	this.mkrandom = function(depth)
	{
		// 85 = 255 / 3
		var segmentsize, nsegments;
		var whitemode = this.random(2);

		segmentsize  = this.random(85 + 4);
		segmentsize += this.random(85 + 4);
		segmentsize += this.random(85 + 4);
		segmentsize += this.random(85 + 4);	/* Make smaller segments with higher probability */

		segmentsize = Math.abs(segmentsize >> 1 - 85 + 3);
		if (segmentsize < 8)
			segmentsize = 8;
		if (segmentsize > 85)
			segmentsize = 85;

		switch (this.random(6)) {
			case 0:
				segmentsize = Math.floor(segmentsize/2)*2;
				nsegments = Math.floor(256 / segmentsize);
				this.randomize_segments1(whitemode, nsegments, segmentsize);
				break;
			case 1:
				segmentsize = Math.floor(segmentsize/3)*3;
				nsegments = Math.floor(256 / segmentsize);
				this.randomize_segments2(whitemode, nsegments, segmentsize);
				break;
			case 2:
				segmentsize = Math.floor(segmentsize/6)*6;
				nsegments = Math.floor(256 / segmentsize);
				this.randomize_segments3(whitemode, nsegments, segmentsize);
				break;
			case 3:
				this.randomize_segments1(whitemode, depth, 1);
				break;
			case 4:
				this.randomize_segments2(whitemode, depth, 1);
				break;
			case 5:
				this.randomize_segments3(whitemode, depth, 1);
				break;
		}
	};

	this.mkdefault = function()
	{
		this.red = this.green = this.blue = new Uint8Array([0x00,0x11,0x22,0x33,0x44,0x55,0x66,0x77,0x88,0x99,0xaa,0xbb,0xcc,0xdd,0xee,0xff]);
	};

	this.mkdefault();
}

/**
 * Viewport to the fractal world.
 * The actual pixel area is square and the viewport is a smaller rectangle that can rotate fully within
 *
 * Coordinate system is the center x,y and radius.
 * 
 * @constructor
 * @param {number} width
 * @param {number} height
 * @param {ImageData} imagedata
 */
function Viewport(width, height, imagedata) {

	// don't go zero
	if (width <= 0)
		width = 1;
	if (height <= 0)
		height = 1;

	/** @member {number} - tick of last update */
	this.tickLast = 0;

	/** @member {Uint8Array} - temporary red palette after rotating palette index */
	this.tmpRed = new Uint8Array(3000); // size to some exteme to avoid clamping of pixel data
	/** @member {Uint8Array} - temporary red palette after rotating palette index */
	this.tmpGreen = new Uint8Array(3000);
	/** @member {Uint8Array} - temporary red palette after rotating palette index */
	this.tmpBlue = new Uint8Array(3000);

	/** @member {number} - width of viewport */
	this.viewWidth = width;
	/** @member {number} - height of viewport */
	this.viewHeight = height;
	/** @member {number} - diameter of the pixel data */
	this.diameter = Math.ceil(Math.sqrt(this.viewWidth * this.viewWidth + this.viewHeight * this.viewHeight));
	/** @member {Uint8Array} - pixel data (must be square) */
	this.pixels = new Uint8Array(this.diameter * this.diameter);
	/** @member {ImageData} - canvas rgba buffer */
	this.imagedata = imagedata;

	/** @member {number} - center X coordinate */
	this.centerX = 0;
	/** @member {number} - center Y coordinate */
	this.centerY = 0;
	/** @member {number} - distance between center and viewport corner */
	this.radius = 0;
	/** @member {number} - distance between center and horizontal viewport edge (derived from this.radius) */
	this.radiusX = 0;
	/** @member {number} - distance between center and vertical viewport edge  (derived from this.radius) */
	this.radiusY = 0;

	/** @member {number} - angle */
	this.angle = 0;
	/** @member {number} - sin(angle) */
	this.rsin = 0;
	/** @member {number} - cos(angle) */
	this.rcos = 1;

	this.xCoord = new Float64Array(this.diameter);
	this.xNearest = new Float64Array(this.diameter);
	this.xError = new Float64Array(this.diameter);
	this.xFrom = new Int32Array(this.diameter);
	this.yCoord = new Float64Array(this.diameter);
	this.yNearest = new Float64Array(this.diameter);
	this.yError = new Float64Array(this.diameter);
	this.yFrom = new Int32Array(this.diameter);
}

/**
 *
 * @param {number} start - start coordinate
 * @param {number} end - end coordinate
 * @param {Float64Array} newCoord - coordinate stops
 * @param {Float64Array} newNearest - nearest evaluated coordinate stop
 * @param {Float64Array} newError - difference between newCoord[] and newNearest[]
 * @param {Uint16Array} newFrom - matching oldNearest[] index
 * @param {Float64Array} oldNearest - source ruler
 * @param {Float64Array} oldError - source ruler
 */
Viewport.prototype.makeRuler = function(start, end, newCoord, newNearest, newError, newFrom, oldNearest, oldError) {

	var iOld, iFrom, iNew, nextError, currError, currCoord;

	/*
	 * Find best member first group (iFrom) and start next group (iOld)
	 */
	iFrom = iOld = 0;
	while (iOld < oldNearest.length && oldNearest[iOld] === oldNearest[iFrom]) {
		if (oldError[iOld] < oldError[iFrom])
			iFrom = iOld;
		++iOld;
	}

	for (iNew = 0; iNew < newCoord.length && iOld < oldNearest.length; iNew++) {

		// determine coordinate current tab stop
		currCoord = (end - start) * iNew / (newCoord.length - 1) + start;

		// determine errors
		currError = Math.abs(currCoord - oldNearest[iFrom]);
		nextError = Math.abs(currCoord - oldNearest[iOld]);

		// bump if next source stop is better
		while (nextError <= currError) {
			iFrom = iOld++;
			while (iOld < oldNearest.length && oldNearest[iOld] === oldNearest[iFrom]) {
				if (oldError[iOld] < oldError[iFrom])
					iFrom = iOld; // member of same group with lowest error
				++iOld;
			}

			currError = nextError;
			if (iOld >= oldNearest.length)
				break;
			nextError = Math.abs(currCoord - oldNearest[iOld]);
		}

		// populate
		newCoord[iNew] = currCoord;
		newNearest[iNew] = oldNearest[iFrom];
		newError[iNew] = currError;
		newFrom[iNew] = iFrom;
	}

	// no more next, copy the only option
	while (iNew < newCoord.length) {
		newCoord[iNew] = (end - start) * iNew / (newCoord.length - 1) + start;
		newNearest[iNew] = oldNearest[iFrom];
		newError[iNew] = Math.abs(newCoord[iNew] - oldNearest[iFrom]);
		newFrom[iNew] = iFrom;
		iNew++;
	}
};

/**
 * Set the center coordinate and radius.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {number} angle
 * @param {Viewport} oldViewport
 */
Viewport.prototype.setPosition = function(x, y, radius, angle, oldViewport) {
	this.centerX = x;
	this.centerY = y;
	this.radius = radius;

	var d = Math.sqrt(this.viewWidth * this.viewWidth + this.viewHeight * this.viewHeight);
	this.radiusX = radius * this.viewWidth / d;
	this.radiusY = radius * this.viewHeight / d;

	// set angle
	this.angle = angle;
	this.rsin = Math.sin(angle * Math.PI / 180);
	this.rcos = Math.cos(angle * Math.PI / 180);

	// window.gui.domStatusQuality.innerHTML = JSON.stringify({x:x, y:y, r:radius, a:angle});

	/*
	 * setup new rulers
	 */
	this.makeRuler(this.centerX - this.radius, this.centerX + this.radius, this.xCoord, this.xNearest, this.xError, this.xFrom, oldViewport.xNearest, oldViewport.xError);
	this.makeRuler(this.centerY - this.radius, this.centerY + this.radius, this.yCoord, this.yNearest, this.yError, this.yFrom, oldViewport.yNearest, oldViewport.yError);

	/**
	 **!
	 **! The following loop is a severe performance hit
	 **!
	 **/

	/*
	 * copy pixels
	 */
	var j=0, i=0, k=0, ji = 0;
	var xFrom = this.xFrom;
	var yFrom = this.yFrom;
	var newDiameter = this.diameter;
	var oldDiameter = oldViewport.diameter;
	var newPixels = this.pixels;
	var oldPixels = oldViewport.pixels;

	// first line
	k = yFrom[0] * oldDiameter;
	for (i = 0; i < newDiameter; i++)
		newPixels[ji++] = oldPixels[k + xFrom[i]];
	// followups
	for (j = 1; j < newDiameter; j++) {
		if (yFrom[j] === yFrom[j-1]) {
			// this line is identical to the previous
			k = ji - newDiameter;
			for (i = 0; i < newDiameter; i++)
				newPixels[ji++] = newPixels[k++];

		} else {
			// extract line from previous frame
			k = yFrom[j] * oldDiameter;
			for (i = 0; i < newDiameter; i++)
				newPixels[ji++] = oldPixels[k + xFrom[i]];
			}
		}
};

/**
 * Test if rulers have reached resolution limits
 *
 * @returns {boolean}
 */
Viewport.prototype.reachedLimits = function() {
	var ij;

	for (ij=1; ij<this.diameter; ij++) {
		if (this.xCoord[ij-1] === this.xCoord[ij] || this.yCoord[ij-1] === this.yCoord[ij])
			return true;

	}
	return false;
};

/**
 * Extract rotated viewport from pixels and store them in specified imnagedata
 * The pixel data is palette based, the imagedata is RGB
 *
 * @param {Uint8Array} paletteRed
 * @param {Uint8Array} paletteGreen
 * @param {Uint8Array} paletteBlue
 */
Viewport.prototype.draw = function(paletteRed, paletteGreen, paletteBlue) {

	// make references local
	var paletteSize = paletteRed.length;
	var tmpRed = this.tmpRed;
	var tmpGreen = this.tmpGreen;
	var tmpBlue = this.tmpBlue;
	var viewWidth = this.viewWidth; // viewport width
	var viewHeight = this.viewHeight; // viewport height
	var pixels = this.pixels; // pixel data
	var diameter = this.diameter; // pixel scanline width (it's square)
	var rgba = this.imagedata.data; // canvas pixel data
	var i, j, x, y, ix, iy, ji, yx, c;

	// palette offset must be integer and may not be negative
	var offset = Math.round(window.config.paletteOffset);
	if (offset < 0)
		offset = (paletteSize-1) - (-offset-1) % paletteSize;
	else
		offset = offset % paletteSize;

	// apply colour cycling (not for first colour)
	tmpRed[0] = window.palette.backgroundRed;
	tmpGreen[0] = window.palette.backgroundGreen;
	tmpBlue[0] = window.palette.backgroundBlue;
	for (i = 1; i < tmpRed.length; i++) {
		tmpRed[i] = paletteRed[(i-1 + offset) % paletteSize + 1];
		tmpGreen[i] = paletteGreen[(i-1 + offset) % paletteSize + 1];
		tmpBlue[i] = paletteBlue[(i-1 + offset) % paletteSize + 1];
	}

	/**
	 **!
	 **! The following loop is a severe performance hit
	 **!
	 **/

	var xstart, ystart;
	if (this.angle === 0) {
		// FAST extract viewport
		xstart = Math.floor((diameter - viewWidth) / 2);
		ystart = Math.floor((diameter - viewHeight) / 2);

		// copy pixels
		ji = 0;
		for (j = 0, y = ystart; j < viewHeight; j++, y++) {
			for (i = 0, yx = y * diameter + xstart; i < viewWidth; i++, yx++) {
				c = pixels[yx];

				rgba[ji++] = tmpRed[c];
				rgba[ji++] = tmpGreen[c];
				rgba[ji++] = tmpBlue[c];
				rgba[ji++] = 255;
			}
		}

	} else {
		// SLOW viewport rotation
		var rsin = this.rsin; // sine for viewport angle
		var rcos = this.rcos; // cosine for viewport angle
		xstart = Math.floor((diameter - viewHeight * rsin - viewWidth * rcos) * 32768);
		ystart = Math.floor((diameter - viewHeight * rcos + viewWidth * rsin) * 32768);
		var ixstep = Math.floor(rcos * 65536);
		var iystep = Math.floor(rsin * -65536);
		var jxstep = Math.floor(rsin * 65536);
		var jystep = Math.floor(rcos * 65536);

		// copy pixels
		ji = 0;
		for (j = 0, x = xstart, y = ystart; j < viewHeight; j++, x += jxstep, y += jystep) {
			for (i = 0, ix = x, iy = y; i < viewWidth; i++, ix += ixstep, iy += iystep) {
				c = pixels[(iy >> 16) * diameter + (ix >> 16)];

				rgba[ji++] = tmpRed[c];
				rgba[ji++] = tmpGreen[c];
				rgba[ji++] = tmpBlue[c];
				rgba[ji++] = 255;
			}
		}
	}
};

/**
 * Simple implementation
 *
 * @param {number} zre
 * @param {number} zim
 * @param {number} pre
 * @param {number} pim
 * @returns {number}
 */
Viewport.prototype.mand_calc = function(zre, zim, pre, pim) {
	var iter = 1, maxiter = window.config.depthNow;
	var rp, ip;
	
	do {
		rp = zre * zre;
		ip = zim * zim;

		zim = 2 * zre * zim + pim;
		zre = rp - ip + pre;
		if (rp + ip >= 4)
			return iter;
	} while (++iter < maxiter);

	return 0;
};

/**
 * Simple background renderer
 */
Viewport.prototype.renderLines = function() {
	// which tabstops have the worst error

	var worstXerr = this.xError[0];
	var worstXi = 0;
	var worstYerr = this.yError[0];
	var worstYj = 0;
	var i, j, k, ji, x, y, err, last;
	var diameter = this.diameter;
	var diameter2 = this.diameter*this.diameter;

	for (i=1; i<diameter; i++) {
		if (this.xError[i] > worstXerr) {
			worstXi = i;
			worstXerr = this.xError[i];
		}
	}
	for (j=1; j<diameter; j++) {
		if (this.yError[j] > worstYerr) {
			worstYj = j;
			worstYerr = this.yError[j];
		}
	}

	if (worstXerr + worstYerr === 0)
		return; // nothing to do

	/**
	 **!
	 **! The following loop is a severe performance hit
	 **!
	 **/

	var lo, hi, lasti, lastj;
	if (worstXerr > worstYerr) {

		i = worstXi;
		x = this.xCoord[i];

		// find first tab stop
		for (j = 0; j < diameter; j++) {
			// only calculate if tabstop is exact
			if (this.yError[j] === 0) {
				lo = j >> 1;
				lastj = j;
				last = this.mand_calc(0, 0, x, this.yCoord[j]);
				break;
			}
		}
		if (j < diameter) {
			// on next tab plot previous value filling half space each side
			for (++j; j < diameter; j++) {
				// only calculate if tabstop is exact
				if (this.yError[j] === 0) {
					hi = (lastj + j) >> 1;
					ji = lo * diameter + i;
					while (lo < hi) {
						this.pixels[ji] = last;
						lo++;
		ji += diameter;
					}

					lo = hi;
					lastj = j;
					last = this.mand_calc(0, 0, x, this.yCoord[j]);
				}
			}
			// fill till halfway end ruler
			hi = (lastj + diameter) >> 1;
			ji = lo * diameter + i;
			while (lo < hi) {
			this.pixels[ji] = last;
				lo++;
			ji += diameter;
		}
		}

		this.xNearest[i] = x;
		this.xError[i] = 0;

		// copy to neighbours if better
		for (k=i+1; k<diameter; k++) {
			err = Math.abs(this.xCoord[k]-x);
			if (err >= this.xError[k])
				break;

			// copy all pixels
			for (j=0; j<diameter2; j+=diameter) {
				this.pixels[j + k] = this.pixels[j + i];
			}

			this.xNearest[k] = x;
			this.xError[k] = err;
		}
		for (k=i-1; k>=0; k--) {
			err = Math.abs(this.xCoord[k]-x);
			if (err >= this.xError[k])
				break;

			// copy all pixels
			for (j=0; j<diameter2; j+=diameter) {
				this.pixels[j + k] = this.pixels[j + i];
			}

			this.xNearest[k] = x;
			this.xError[k] = err;
		}

	} else {

		j = worstYj;
		y = this.yCoord[j];

		// find first tab stop
		for (i = 0; i < diameter; i++) {
			// only calculate if tabstop is exact
			if (this.xError[i] === 0) {
				lo = i >> 1;
				lasti = i;
				last = this.mand_calc(0, 0, this.xCoord[i], y);
				break;
			}
		}
		if (i < diameter) {
			// on next tab plot previous value filling half space each side
			for (++i; i < diameter; i++) {
				// only calculate if tabstop is exact
				if (this.xError[i] === 0) {
					hi = (lasti + i) >> 1;
					ji = j * diameter + lo;
					while (lo < hi) {
						this.pixels[ji] = last;
						lo++;
						ji++;
					}

					lo = hi;
					lasti = i;
					last = this.mand_calc(0, 0, this.xCoord[i], y);
				}
		}
			// fill till halfway end ruler
			hi = (lasti + diameter) >> 1;
			ji = j * diameter + lo;
			while (lo < hi) {
				this.pixels[ji] = last;
				lo++;
				ji++;
			}
		}

		this.yNearest[j] = y;
		this.yError[j] = 0;

		// copy to neighbours if better
		for (k = j + 1; k < diameter; k++) {
			err = Math.abs(this.yCoord[k]-y);
			if (err >= this.yError[k])
				break;

			// copy all pixels
			ji = j * diameter;
			for (i=0; i<diameter; i++) {
				this.pixels[ji + k] = this.pixels[ji + i];
			}

			this.yNearest[k] = y;
			this.yError[k] = err;
		}
		for (k = j - 1; k >= 0; k--) {
			err = Math.abs(this.yCoord[k]-y);
			if (err >= this.yError[k])
				break;

			// copy all pixels
			ji = j * diameter;
			for (i=0; i<diameter; i++) {
				this.pixels[ji + k] = this.pixels[ji + i];
			}

			this.yNearest[k] = y;
			this.yError[k] = err;
		}
	}
};

Viewport.prototype.fill = function() {

	this.centerX = -0.75;
	this.centerY = 0;
	this.radius = 2.5;
	this.angle = 0;

	var d = Math.sqrt(this.viewWidth * this.viewWidth + this.viewHeight * this.viewHeight);
	this.radiusX = this.radius * this.viewWidth / d;
	this.radiusY = this.radius * this.viewHeight / d;

	this.rsin = Math.sin(this.angle * Math.PI / 180);
	this.rcos = Math.cos(this.angle * Math.PI / 180);


	for (var i = 0; i < this.xCoord.length; i++)
		this.xNearest[i] = this.xCoord[i] = ((this.centerX + this.radius) - (this.centerX - this.radius)) * i / (this.xCoord.length - 1) + (this.centerX - this.radius);
	for (var i = 0; i < this.xCoord.length; i++)
		this.yNearest[i] = this.yCoord[i] = ((this.centerY + this.radius) - (this.centerY - this.radius)) * i / (this.yCoord.length - 1) + (this.centerY - this.radius);

	var ji = 0;
	for (var j = 0; j < this.diameter; j++) {
		var y = (this.centerY - this.radius) + this.radius * 2 * j / this.diameter;
		for (var i = 0; i < this.diameter; i++) {
			// distance to center
			var x = (this.centerX - this.radius) + this.radius * 2 * i / this.diameter;
			this.pixels[ji++] = this.mand_calc(0, 0, x, y);
		}
	}
};

/**
 * DOM bindings and event handlers
 *
 * @constructor
 * @param config {Config}
 */
function GUI(config) {
	/** @member {Config} - Reference to config object */
	this.config = config;

	/*
	 * DOM elements and their matching id's
	 */
	this.domViewport = "idViewport";
	this.domStatusQuality = "idStatusQuality";
	this.domStatusLoad = "idStatusLoad";
	this.domStatusRect = "idStatusRect";
	this.domPowerButton = "idPowerButton";
	this.domAutoPilotButton = "idAutoPilotButton";
	this.domHomeButton = "idHomeButton";
	this.domFormulaButton = "idFormulaButton";
	this.domFormulaList = "idFormulaList";
	this.domIncolourButton = "idIncolourButton";
	this.domIncolourList = "idIncolourList";
	this.domOutcolourButton = "idOutcolourButton";
	this.domOutcolourList = "idOutcolourList";
	this.domPlaneButton = "idPlaneButton";
	this.domPlaneList = "idPlaneList";
	this.domZoomSpeedLeft = "idZoomSpeedLeft";
	this.domZoomSpeedRail = "idZoomSpeedRail";
	this.domZoomSpeedThumb = "idZoomSpeedThumb";
	this.domRotateLeft = "idRotateLeft";
	this.domRotateRail = "idRotateRail";
	this.domRotateThumb = "idRotateThumb";
	this.domPaletteSpeedLeft = "idPaletteSpeedLeft";
	this.domPaletteSpeedRail = "idPaletteSpeedRail";
	this.domPaletteSpeedThumb = "idPaletteSpeedThumb";
	this.domRandomPaletteButton = "idRandomPaletteButton";
	this.domDefaultPaletteButton = "idDefaultPaletteButton";
	this.domDepthLeft = "idDepthLeft";
	this.domDepthRail = "idDepthRail";
	this.domDepthThumb = "idDepthThumb";
	this.domFramerateLeft = "idFramerateLeft";
	this.domFramerateRail = "idFramerateRail";
	this.domFramerateThumb = "idFramerateThumb";
	this.domWxH = "WxH";
	this.domAutopilot = "idAutopilot";

	/** @member {number} - viewport mouse X coordinate */
	this.mouseI = 0;
	this.mouseX = 0;
	/** @member {number} - viewport mouse Y coordinate */
	this.mouseJ = 0;
	this.mouseY = 0;
	/** @member {number} - viewport mouse button state. OR-ed set of Aria.ButtonCode */
	this.mouseButtons = 0;

	/** @member {number} -  0=STOP 1=COPY 2=UPDATE-before-rAF 3=IDLE 4=rAF 5=UPDATE-after-rAF 6=PAINT */
	this.state = 0;
	/** @member {number} - Timestamp next vsync */
	this.vsync = 0;
	/** @member {number} - Number of frames painted */
	this.frameNr = 0;
	/** @member {number} - Number of times mainloop called */
	this.mainloopNr = 0;

	/** @member {number} - Damping coefficient low-pass filter for following fields */
	this.coef = 0.05;
	/** @member {number} - Average time in mSec spent in COPY */
	this.statStateCopy = 0;
	/** @member {number} - Average time in mSec spent in UPDATE */
	this.statStateUpdate = 0;
	/** @member {number} - Average time in mSec spent in PAINT */
	this.statStatePaint = 0;
	/** @member {number} - Average time in mSec waiting for rAF() */
	this.statStateRAF = 0;

	/** @member {boolean} - fractal coordinate of pointer when button first pressed */
	this.dragActive = false;
	/** @member {boolean} - fractal X coordinate of pointer */
	this.dragActiveX = 0;
	/** @member {boolean} - fractal Y coordinate of pointer */
	this.dragActiveY = 0;

	// per second differences
	this.lastNow = 0;
	this.lastFrame = 0;
	this.lastLoop = 0;
	this.counters = [0,0,0,0,0,0,0];
	this.rafTime = 0;
	this.cycleTime = 0;
	this.ctx = undefined;
	this.imagedata0 = undefined;
	this.imagedata1 = undefined;
	this.viewport0 = undefined;
	this.viewport1 = undefined;

	/*
	 * Find the elements and replace the string names for DOM references
	 */
	for (var property in this) {
		if (this.hasOwnProperty(property) && property.substr(0,3) === "dom") {
			this[property] = document.getElementById(this[property]);
		}
	}

	// get context
	this.ctx = this.domViewport.getContext("2d", { alpha: false });
	this.imagedata0 = this.ctx.createImageData(this.domViewport.clientWidth, this.domViewport.clientHeight);
	this.imagedata1 = this.ctx.createImageData(this.domViewport.clientWidth, this.domViewport.clientHeight);
	this.viewport0 = new Viewport(this.domViewport.clientWidth, this.domViewport.clientHeight, this.imagedata0);
	this.viewport1 = new Viewport(this.domViewport.clientWidth, this.domViewport.clientHeight, this.imagedata1);
	// small viewport for initial image
	this.imagedataInit = this.ctx.createImageData(64, 64);
	this.viewportInit = new Viewport(64, 64, this.imagedataInit);

	// initial palette
	this.paletteRed = [230, 135, 75, 254, 255, 246, 223, 255, 255, 197, 255, 255, 214, 108, 255, 255];
	this.paletteGreen = [179, 135, 75, 203, 244, 246, 223, 212, 224, 146, 235, 247, 214, 108, 255, 255];
	this.paletteBlue = [78, 135, 75, 102, 142, 246, 223, 111, 123, 45, 133, 145, 214, 108, 153, 255];
	// grayscale
	this.paletteRed = new Uint8Array([0x00,0x10,0x20,0x30,0x40,0x50,0x60,0x70,0x80,0x90,0xa0,0xb0,0xc0,0xd0,0xe0,0xf0]);
	this.paletteGreen = new Uint8Array([0x00,0x10,0x20,0x30,0x40,0x50,0x60,0x70,0x80,0x90,0xa0,0xb0,0xc0,0xd0,0xe0,0xf0]);
	this.paletteBlue = new Uint8Array([0x00,0x10,0x20,0x30,0x40,0x50,0x60,0x70,0x80,0x90,0xa0,0xb0,0xc0,0xd0,0xe0,0xf0]);

	// replace event handlers with a bound instance
	this.mainloop = this.mainloop.bind(this);
	this.animationFrame = this.animationFrame.bind(this);
	this.handleMouse = this.handleMouse.bind(this);
	this.handleFocus = this.handleFocus.bind(this);
	this.handleBlur = this.handleBlur.bind(this);
	this.handleKeyDown = this.handleKeyDown.bind(this);
	this.handleKeyUp = this.handleKeyUp.bind(this);
	this.handleMessage = this.handleMessage.bind(this);

	// register global key bindings before widgets overrides
	this.domViewport.addEventListener("focus", this.handleFocus);
	this.domViewport.addEventListener("blur", this.handleBlur);
	this.domViewport.addEventListener("mousedown", this.handleMouse);
	this.domViewport.addEventListener("contextmenu", this.handleMouse);
	document.addEventListener("keydown", this.handleKeyDown);
	document.addEventListener("keyup", this.handleKeyUp);
	window.addEventListener("message", this.handleMessage);

	// construct sliders
	this.speed = new Aria.Slider(this.domZoomSpeedThumb, this.domZoomSpeedRail,
		config.magnificationMin, config.magnificationMax, config.magnificationNow);
	this.rotateSpeed = new Aria.Slider(this.domRotateThumb, this.domRotateRail,
		config.rotateSpeedMin, config.rotateSpeedMax, config.rotateSpeedNow);
	this.paletteSpeed = new Aria.Slider(this.domPaletteSpeedThumb, this.domPaletteSpeedRail,
		config.paletteSpeedMin, config.paletteSpeedMax, config.paletteSpeedNow);
	this.depth = new Aria.Slider(this.domDepthThumb, this.domDepthRail,
		config.depthMin, config.depthMax, config.depthNow);
	this.Framerate = new Aria.Slider(this.domFramerateThumb, this.domFramerateRail,
		config.framerateMin, config.framerateMax, config.framerateNow);

	// construct controlling listbox button
	this.formula = new Aria.ListboxButton(this.domFormulaButton, this.domFormulaList);
	this.incolour = new Aria.ListboxButton(this.domIncolourButton, this.domIncolourList);
	this.outcolour = new Aria.ListboxButton(this.domOutcolourButton, this.domOutcolourList);
	this.plane = new Aria.ListboxButton(this.domPlaneButton, this.domPlaneList);

	// construct buttons
	this.power = new Aria.Button(this.domPowerButton, true);
	this.autoPilot = new Aria.Button(this.domAutoPilotButton, true);
	this.home = new Aria.Button(this.domHomeButton, false);

	// construct radio group
	this.paletteGroup = new Aria.RadioGroup(document.getElementById("idPaletteGroup"));
	this.randomPalette = this.paletteGroup.radioButtons[0];
	this.defaultPalette = this.paletteGroup.radioButtons[1];

	// attach event listeners
	var self = this;

	// sliders
	this.speed.setCallbackValueChange(function(newValue) {
		// scale exponentially
		newValue = config.linearToLog(config.magnificationMin, config.magnificationMax, newValue);
		config.magnificationNow = newValue;
		self.domZoomSpeedLeft.innerHTML = newValue.toFixed(2);
	});
	this.rotateSpeed.setCallbackValueChange(function(newValue) {
		config.rotateSpeedNow = newValue;
		self.domRotateLeft.innerHTML = newValue.toFixed(1);
	});
	this.paletteSpeed.setCallbackValueChange(function(newValue) {
		config.paletteSpeedNow = newValue;
		self.domPaletteSpeedLeft.innerHTML = newValue.toFixed(0);
	});
	this.depth.setCallbackValueChange(function(newValue) {
		newValue = Math.round(newValue);
		config.depthNow = newValue;
		self.domDepthLeft.innerHTML = newValue;
	});
	this.Framerate.setCallbackValueChange(function(newValue) {
		newValue = Math.round(newValue);
		config.framerateNow = newValue;
		self.domFramerateLeft.innerHTML = newValue;
	});

	// listboxes
	this.formula.listbox.setCallbackFocusChange(function(focusedItem) {
		config.formula = focusedItem.id;
		self.domFormulaButton.innerText = focusedItem.innerText;
	});
	this.incolour.listbox.setCallbackFocusChange(function(focusedItem) {
		config.incolour = focusedItem.id;
		self.domIncolourButton.innerText = focusedItem.innerText;
	});
	this.outcolour.listbox.setCallbackFocusChange(function(focusedItem) {
		config.outcolour = focusedItem.id;
		self.domOutcolourButton.innerText = focusedItem.innerText;
	});
	this.plane.listbox.setCallbackFocusChange(function(focusedItem) {
		config.plane = focusedItem.id;
		self.domPlaneButton.innerText = focusedItem.innerText;
	});

	// buttons
	this.power.setCallbackValueChange(function(newValue) {
		if (newValue)
			self.start(); // power on
		else
			self.stop(); // power off
	});
	this.autoPilot.setCallbackValueChange(function(newValue) {
		self.config.autoPilot = newValue;
		if (newValue) {
			self.autopilotOn();
		} else {
			self.autopilotOff();
		}
	});
	this.home.setCallbackValueChange(function(newValue) {
		self.config.centerX = -0.75;
		self.config.centerY = 0;
		self.config.radius = 2.5;
		self.config.angle = 0;
	});

	this.paletteGroup.setCallbackFocusChange(function(newButton) {
		if (newButton.domButton.id === "idRandomPaletteButton") {
			window.palette.mkrandom(self.config.depthNow);
		} else {
			window.palette.mkdefault();
		}
		self.paletteRed = window.palette.red;
		self.paletteGreen = window.palette.green;
		self.paletteBlue = window.palette.blue;
	});

	// set initial coordinate
	this.viewportInit.fill();
	this.viewport0.setPosition(config.centerX, config.centerY, config.radius, config.angle, this.viewportInit);
}

/**
 * Handle keyboard down event
 *
 * @param {KeyboardEvent} event
 */
GUI.prototype.handleKeyDown = function (event) {
	var key = event.which || event.keyCode;

	// Grab the keydown and click events
	switch (key) {
		case 0x41: // A
		case 0x61: // a
			this.autoPilot.buttonDown();
			this.domAutoPilotButton.focus();
			break;
		case 0x44: // D
		case 0x64: // d
			this.paletteGroup.radioButtons[1].buttonDown();
			this.domDefaultPaletteButton.focus();
			break;
		case 0x46: // F
		case 0x66: // f
			if (!this.formula.toggleListbox(event))
				this.domViewport.focus();
			break;
		case 0x49: // I
		case 0x69: // i
			if (!this.incolour.toggleListbox(event))
				this.domViewport.focus();
			break;
		case 0x4f: // O
		case 0x6f: // o
			if (!this.outcolour.toggleListbox(event))
				this.domViewport.focus();
			break;
		case 0x50: // P
		case 0x70: // p
			if (!this.plane.toggleListbox(event))
				this.domViewport.focus();
			break;
		case 0x51: // Q
		case 0x71: // q
			this.power.buttonDown();
			this.domPowerButton.focus();
			break;
		case 0x52: // R
		case 0x72: // r
			this.paletteGroup.radioButtons[0].buttonDown();
			this.domRandomPaletteButton.focus();
			break;
		case Aria.KeyCode.HOME:
			this.home.buttonDown();
			this.domHomeButton.focus();
			break;
		case Aria.KeyCode.UP:
			this.speed.moveSliderTo(this.speed.valueNow + 1);
			this.domZoomSpeedThumb.focus();
			break;
		case Aria.KeyCode.DOWN:
			this.speed.moveSliderTo(this.speed.valueNow - 1);
			this.domZoomSpeedThumb.focus();
			break;
		case Aria.KeyCode.PAGE_UP:
			this.rotateSpeed.moveSliderTo(this.rotateSpeed.valueNow + 1);
			this.domRotateThumb.focus();
			break;
		case Aria.KeyCode.PAGE_DOWN:
			this.rotateSpeed.moveSliderTo(this.rotateSpeed.valueNow - 1);
			this.domRotateThumb.focus();
			break;
		default:
			return;
	}

	event.preventDefault();
	event.stopPropagation();

};

/**
 * Handle keyboard up event
 *
 * @param {KeyboardEvent} event
 */
GUI.prototype.handleKeyUp = function (event) {
	var key = event.which || event.keyCode;

	// Grab the keydown and click events
	switch (key) {
		case 0x41: // A
		case 0x61: // a
			this.autoPilot.buttonUp();
			this.domViewport.focus();
			break;
		case 0x44: // D
		case 0x64: // d
			this.paletteGroup.radioButtons[1].buttonUp();
			this.domViewport.focus();
			break;
		case 0x51: // Q
		case 0x71: // q
			this.power.buttonUp();
			this.domViewport.focus();
			break;
		case 0x52: // R
		case 0x62: // r
			this.paletteGroup.radioButtons[0].buttonUp();
			this.domViewport.focus();
			break;
		case Aria.KeyCode.HOME:
			this.home.buttonUp();
			this.domViewport.focus();
			break;
		case Aria.KeyCode.UP:
			this.domViewport.focus();
			break;
		case Aria.KeyCode.DOWN:
			this.domViewport.focus();
			break;
		case Aria.KeyCode.PAGE_DOWN:
			this.domViewport.focus();
			break;
		case Aria.KeyCode.PAGE_UP:
			this.domViewport.focus();
			break;
	}

	event.preventDefault();
	event.stopPropagation();

};

/**
 * Handle focus event
 *
 * @param {FocusEvent} event
 */
GUI.prototype.handleFocus = function (event) {
	this.domViewport.classList.add("focus");
};

/**
 * Handle blur event
 *
 * @param {FocusEvent} event
 */
GUI.prototype.handleBlur = function (event) {
	this.domViewport.classList.remove("focus");
};

/**
 * Shared handler for all mouse events
 *
 * @param {MouseEvent} event
 */
GUI.prototype.handleMouse = function(event) {

	var rect = this.domViewport.getBoundingClientRect();

	/*
	 * On first button press set a document listener to catch releases outside target element
	 */
	if (this.mouseButtons === 0 && event.buttons !== 0) {
		// on first button press set release listeners
		document.addEventListener("mousemove", this.handleMouse);
		document.addEventListener("mouseup", this.handleMouse);
		document.addEventListener("contextmenu", this.handleMouse);
	}

	this.mouseI = event.pageX - rect.left;
	this.mouseJ = event.pageY - rect.top;

	var viewport = (this.frameNr&1) ? this.viewport1 : this.viewport0;

	// relative to viewport center
	var dx = this.mouseI * viewport.radiusX * 2 / viewport.viewWidth - viewport.radiusX;
	var dy = this.mouseJ * viewport.radiusY * 2 / viewport.viewHeight - viewport.radiusY;
	// undo rotation
	this.mouseX = dy * viewport.rsin + dx * viewport.rcos + viewport.centerX;
	this.mouseY = dy * viewport.rcos - dx * viewport.rsin + viewport.centerY;

	this.mouseButtons = event.buttons;

	if (event.buttons === 0) {
		// remove listeners when last button released
		document.removeEventListener("mousemove", this.handleMouse);
		document.removeEventListener("mouseup", this.handleMouse);
		document.removeEventListener("contextmenu", this.handleMouse);
	}

	event.preventDefault();
	event.stopPropagation();
};

/**
 * Use message queue as highspeed queue handler. SetTimeout() is throttled.
 *
 * @param {message} event
 */
GUI.prototype.handleMessage = function(event) {
	if (event.source === window && event.data === "mainloop") {
		event.stopPropagation();
		this.mainloop();
	}
};

/**
 * start the mainloop
 */
GUI.prototype.start = function() {
	this.state = 1;
	this.vsync = performance.now() + (1000 / this.config.framerateNow); // vsync wakeup time
	this.statStateCopy = this.statStateUpdate = this.statStatePaint = 0;
	this.config.tickLast = performance.now();
	window.postMessage("mainloop", "*");
};

/**
 * stop the mainloop
 */
GUI.prototype.stop = function() {
	this.state = 0;
};

/**
 * Synchronise screen updates
 *
 * @param {number} time
 */
GUI.prototype.animationFrame = function(time) {
	// paint image onto canvas

	// write the buffer which is not being written
	if (this.frameNr&1)
		this.ctx.putImageData(this.viewport0.imagedata, 0, 0);
	else
		this.ctx.putImageData(this.viewport1.imagedata, 0, 0);

	this.statStateRAF += ((performance.now() - this.rafTime) - this.statStateRAF) * this.coef;

	// bump to PAINT state
	this.state = 6;
};


/**
 * GUI mainloop called by timer event
 *
 * @returns {boolean}
 */
GUI.prototype.mainloop = function() {
	if (!this.state) {
		console.log("STOP");
		return false;
	}
	this.mainloopNr++;

	// make local for speed
	var config = this.config;
	var viewport = (this.frameNr&1) ? this.viewport1 : this.viewport0;


	// current time
	var last;
	var now = performance.now();

	if (this.vsync === 0 || now > this.vsync + 2000) {
		// Missed vsync by more than 2 seconds, resync
		this.vsync = now + (1000 / config.framerateNow);
		this.cycleTime = now;
		this.state = 1;
	}

	if (this.state === 2) {
		/*
		 * UPDATE-before-rAF. calculate inaccurate pixels
		 */
		this.counters[2]++;
		last = now;

		if (now >= this.vsync - 2) {
			// don't even start if there is less than 2mSec left till next vsync
			this.state = 3;
		} else {
			/*
			 * update inaccurate pixels
			 */

			// end time is 2mSec before next vertical sync
			var endtime = this.vsync - 2;
			if (endtime > now + 2)
				endtime = now + 2;

			/*
			 * Calculate lines
			 */

			var numLines = 0;
			while (now < endtime) {
				viewport.renderLines();

				now = performance.now();
				numLines++;
			}

			// update stats
			this.statStateUpdate += ((now - last) / numLines - this.statStateUpdate) * this.coef;

			window.postMessage("mainloop", "*");
			return true;
		}
	}

	if (this.state === 3) {
		/*
		 * IDLE. Wait for vsync
		 */
		this.counters[3]++;

		if (now >= this.vsync) {
			// vsync is NOW
			this.state = 4;
		} else {
			window.postMessage("mainloop", "*");
			return true;
		}
	}
	if (this.state === 4) {
		/*
		 * requestAnimationFrame()
		 */
		this.counters[4]++;

		this.state = 5; // !! This must be set before rAF is called
		this.vsync += (1000 / config.framerateNow); // time of next vsync
		this.rafTime = now;
		window.requestAnimationFrame(this.animationFrame);

		window.postMessage("mainloop", "*");
		return true;
	}
	if (this.state === 5) {
		/*
		 * WAIT. UPDATE-after-rAF. Wait for animateFrame() to change state
		 */
		this.counters[5]++;
		last = now;

		viewport.renderLines();

		// update stats
		now = performance.now();
		this.statStateUpdate += ((now - last) - this.statStateUpdate) * this.coef;

		window.postMessage("mainloop", "*");
		return true;
	}
	if (this.state === 6) {
		/*
		 * PAINT. Finalize viewport so it can be presented immediately on the next vsync
		 */
		this.counters[6]++;
		last = now;
		if (this.frameNr&1)
			this.viewport1.draw(this.paletteRed, this.paletteGreen, this.paletteBlue);
		else
			this.viewport0.draw(this.paletteRed, this.paletteGreen, this.paletteBlue);

		// update stats
		now = performance.now();
		this.statStatePaint += ((now - last) - this.statStatePaint) * this.coef;

		this.state = 1;
		window.postMessage("mainloop", "*");
		return true;
	}

	/**
	***
	*** Start of new cycle
	***
	**/
	this.counters[1]++;
	last = now;

	// seconds since last cycle
	var diffSec = (now - this.cycleTime) / 1000;
	this.cycleTime = now;

	if (config.autoPilot) {
		if (this.frameNr & 1) {
			if (this.viewport1.reachedLimits()) {
				config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_RIGHT;
				window.gui.domAutopilot.style.border = '4px solid orange';
			} else {
				this.domStatusQuality.innerHTML = "";
				if (!this.viewport1.updateAutopilot(4, 16))
					if (!this.viewport1.updateAutopilot(60, 16))
						if (!this.viewport1.updateAutopilot(this.viewport1.diameter >> 1, 16))
							config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_RIGHT;
			}
		} else {
			if (this.viewport0.reachedLimits()) {
				config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_RIGHT;
				window.gui.domAutopilot.style.border = '4px solid orange';
			} else {
				this.domStatusQuality.innerHTML = "";
				if (!this.viewport0.updateAutopilot(4, 16))
					if (!this.viewport0.updateAutopilot(60, 16))
						if (!this.viewport0.updateAutopilot(this.viewport0.diameter >> 1, 16))
							config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_RIGHT;
			}
		}

		this.mouseX = config.autopilotX;
		this.mouseY = config.autopilotY;
		this.mouseButtons = config.autopilotButtons;
	}

	/*
	 * Update zoom (de-)acceleration. -1 <= zoomSpeed <= +1
	 */
	if (this.mouseButtons === (1 << Aria.ButtonCode.BUTTON_LEFT)) {
		// zoom-in only
		config.zoomSpeed = +1 - (+1 - config.zoomSpeed) * Math.pow((1 - config.zoomSpeedCoef), diffSec);
	} else if (this.mouseButtons === (1 << Aria.ButtonCode.BUTTON_RIGHT)) {
		// zoom-out only
		config.zoomSpeed = -1 - (-1 - config.zoomSpeed) * Math.pow((1 - config.zoomSpeedCoef), diffSec);
	} else if (this.mouseButtons === 0) {
		// buttons released
		config.zoomSpeed = config.zoomSpeed * Math.pow((1 - config.zoomSpeedCoef), diffSec);

		if (config.zoomSpeed >= -0.001 && config.zoomSpeed < +0.001)
			config.zoomSpeed = 0; // full stop
	}

	/*
	 * test for viewport resize
	 */
	var domViewport = this.domViewport;
	if (domViewport.clientWidth !== domViewport.width || domViewport.clientHeight !== domViewport.height) {
		// set property
		domViewport.width = domViewport.clientWidth;
		domViewport.height = domViewport.clientHeight;

		var oldViewport0 = this.viewport0;
		var oldViewport1 = this.viewport1;

		// create new imagedata
		this.imagedata0 = this.ctx.createImageData(domViewport.clientWidth, domViewport.clientHeight);
		this.imagedata1 = this.ctx.createImageData(domViewport.clientWidth, domViewport.clientHeight);

		// create new viewports
		this.viewport0 = new Viewport(domViewport.clientWidth, domViewport.clientHeight, this.imagedata0);
		this.viewport1 = new Viewport(domViewport.clientWidth, domViewport.clientHeight, this.imagedata1);

		// copy the contents. However the start frame is empty because the input has none
		if (this.frameNr & 1)
			this.viewport1.setPosition(oldViewport1.centerX, oldViewport1.centerY, oldViewport1.radius, oldViewport1.angle, this.viewport1);
		else
			this.viewport0.setPosition(oldViewport0.centerX, oldViewport0.centerY, oldViewport0.radius, oldViewport0.angle, this.viewport0);

		// update GUI
		this.domWxH.innerHTML = "[" + domViewport.clientWidth + "x" + domViewport.clientHeight + "]";
	}

	/*
	 * Update palette cycle offset
	 */
	if (config.paletteSpeedNow)
		config.paletteOffset -= diffSec * config.paletteSpeedNow;

	/*
	 * Update viewport angle (before zoom gestures)
	 */
	if (config.rotateSpeedNow)
		config.angle += diffSec * config.rotateSpeedNow * 360;

	// drag gesture
	if (this.mouseButtons === (1 << Aria.ButtonCode.BUTTON_WHEEL)) {
		// need screen coordinates to avoid drifting
		// relative to viewport center
		var dx = this.mouseI * viewport.radiusX * 2 / viewport.viewWidth - viewport.radiusX;
		var dy = this.mouseJ * viewport.radiusY * 2 / viewport.viewHeight - viewport.radiusY;
		// undo rotation
		var x = dy * viewport.rsin + dx * viewport.rcos + viewport.centerX;
		var y = dy * viewport.rcos - dx * viewport.rsin + viewport.centerY;

		if (!this.dragActive) {
			// save the fractal coordinate of the mouse position. that stays constant during the drag gesture
			this.dragActiveX = x;
			this.dragActiveY = y;
			this.dragActive = true;
		}

		// update x/y but keep radius
		config.centerX = config.centerX - x + this.dragActiveX;
		config.centerY = config.centerY - y + this.dragActiveY;
	} else {
		this.dragActive = false;
	}

	// zoom-in/out gesture
	if (config.zoomSpeed) {
		// convert normalised zoom speed (-1<=speed<=+1) to magnification and scale to this time interval
		var magnify = Math.pow(config.magnificationNow, config.zoomSpeed * diffSec);

		// zoom, The mouse pointer coordinate should not change
		config.centerX = (config.centerX - this.mouseX) / magnify + this.mouseX;
		config.centerY = (config.centerY - this.mouseY) / magnify + this.mouseY;
		config.radius  = config.radius / magnify;
	}

	/*
	 * COPY
	 */

	this.frameNr++;

	if (this.frameNr & 1)
		this.viewport1.setPosition(config.centerX, config.centerY, config.radius, config.angle, this.viewport0);
	else
		this.viewport0.setPosition(config.centerX, config.centerY, config.radius, config.angle, this.viewport1);

	// update stats
	now = performance.now();
	this.statStateCopy += ((now - last) - this.statStateCopy) * this.coef;

	// window.gui.domStatusQuality.innerHTML = JSON.stringify(this.counters);

	this.domStatusRect.innerHTML =
		"zoom:" + this.statStateCopy.toFixed(3) +
		"mSec("+ (this.statStateCopy*100/(1000 / config.framerateNow)).toFixed(0) +
		"%), update:" + this.statStateUpdate.toFixed(3) +
		"mSec, paint:" + this.statStatePaint.toFixed(3) +
		"mSec("+ (this.statStatePaint*100/(1000 / config.framerateNow)).toFixed(0) +
		"%), rAF:" + this.statStateRAF.toFixed(3) ;

	if (Math.floor(now/1000) !== this.lastNow) {
		this.domStatusLoad.innerHTML = "FPS:"+(this.frameNr - this.lastFrame) + " IPS:" + (this.mainloopNr - this.lastLoop);
		this.lastNow = 	Math.floor(now/1000);
		this.lastFrame = this.frameNr;
		this.lastLoop = this.mainloopNr;
	}

	this.state = 2;
	window.postMessage("mainloop", "*");
	return true;
};

/**
 * @param {number} lookPixelRadius
 * @param {number} borderPixelRadius
 * @returns {boolean}
 */
Viewport.prototype.updateAutopilot = function(lookPixelRadius, borderPixelRadius) {

	var config = window.config;
	var pixels = this.pixels;

	// use '>>1' as integer '/2'

	// coordinate within pixel data pointed to by mouse
	// todo: compensate rotation
	var api = ((config.autopilotX - this.centerX) / this.radius + 1) * this.diameter >> 1;
	var apj = ((config.autopilotY - this.centerY) / this.radius + 1) * this.diameter >> 1;

	var min = ((borderPixelRadius + 1) * (borderPixelRadius + 1)) >> 2;
	var max = min * 3;


		// outside center rectangle, adjust autopilot heading
		for (var k = 0; k < 450; k++) {
			var i0 = api + Math.floor(Math.random() * (2 * lookPixelRadius)) - lookPixelRadius;
			var j0 = apj + Math.floor(Math.random() * (2 * lookPixelRadius)) - lookPixelRadius;
			// convert to x/y
			var x = (i0 / this.diameter * 2 - 1) * this.radius + this.centerX;
			var y = (j0 / this.diameter * 2 - 1) * this.radius + this.centerY;
			// convert to viewport coords (use '>>1' as integer '/2'
			var i = (((x - this.centerX) * this.rcos - (y - this.centerY) * this.rsin + this.radiusX) * this.viewWidth / this.radiusX) >> 1;
			var j = (((x - this.centerX) * this.rsin + (y - this.centerY) * this.rcos + this.radiusY) * this.viewHeight / this.radiusY) >> 1;
			// must be visable
			if (i < borderPixelRadius || j < borderPixelRadius || i >= this.viewWidth-borderPixelRadius || j >= this.viewHeight-borderPixelRadius)
				continue;

			var c = 0;
			for (j = j0 - borderPixelRadius; j <= j0 + borderPixelRadius; j++)
				for (i = i0 - borderPixelRadius; i <= i0 + borderPixelRadius; i++)
					if (pixels[j * this.diameter + i] === 0)
						c++;
			if (c >= min && c <= max) {
				config.autopilotX = x;
				config.autopilotY = y;
				config.autopilotButtons = 1<<Aria.ButtonCode.BUTTON_LEFT;

				var i = (((x - this.centerX) * this.rcos - (y - this.centerY) * this.rsin + this.radiusX) * this.viewWidth / this.radiusX) >> 1;
				var j = (((x - this.centerX) * this.rsin + (y - this.centerY) * this.rcos + this.radiusY) * this.viewHeight / this.radiusY) >> 1;
				window.gui.domAutopilot.style.top = (j - borderPixelRadius)+"px";
				window.gui.domAutopilot.style.left = (i - borderPixelRadius)+"px";
				window.gui.domAutopilot.style.width = (borderPixelRadius*2)+"px";
				window.gui.domAutopilot.style.height = (borderPixelRadius*2)+"px";
				window.gui.domAutopilot.style.border = '4px solid green';
				return true;
			}
		}

	config.autopilotButtons = 0;
	window.gui.domAutopilot.style.border = '4px solid red';
	return false;
};

GUI.prototype.autopilotOn = function() {

	var viewport = (this.frameNr & 1) ? this.viewport1 : this.viewport0;

	var lookPixelRadius = viewport.diameter >> 1;
	var borderPixelRadius = viewport.diameter >> 5;
	do {
		if (!viewport.updateAutopilot(lookPixelRadius, 32))
			break;
		lookPixelRadius >>= 1;
	} while (lookPixelRadius > 2);
};

GUI.prototype.autopilotOff = function() {
	this.mouseButtons = 0;
	this.domAutopilot.style.border = 'none';

};
