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
 *               COPY0  UPDATE0     COPY1  UPDATE1     COPY2  UPDATE2     COPY0  UPDATE0     COPY1  UPDATE1
 * pixel0:      <--W--> WWWWIIWWWW <--R-->                               <--W--> WWWWIIWWWW <--R-->
 * worker0                                <----paint---->                                          <----paint---->
 * pixel1:                         <--W--> WWWWIIWWWW <--R-->                               <--W--> WWWWIIWWWW
 * worker1                                                   <----paint---->
 * pixel2:      <--R-->                               <--W--> WWWWIIWWWW <--R-->
 * worker2             <----paint---->                                          <----paint---->
 *                 ^rAF               ^rAF               ^rAF               ^rAF               ^rAF
 *                    ^AF imagedata2     ^AF imagedata0      ^AF imagedata1     ^AF imagedata2     ^AF imagedata0
 */

"use strict";

/**
 * Globals settings and values
 *
 * @namespace
 */
function Config() {

	/*
	 * GUI settings
	 */
	Config.power = false;
	Config.autoPilot = false;

	/** @member {number} - zoom magnification slider Min */
	Config.magnificationMin = 1.0;
	/** @member {number} - zoom magnification slider Max */
	Config.magnificationMax = 1000.0;
	/** @member {number} - zoom magnification slider Now */
	Config.magnificationNow = Config.logTolinear(Config.magnificationMin, Config.magnificationMax, 1000);

	/** @member {number} - rotate speed slider Min */
	Config.rotateSpeedMin = -0.5;
	/** @member {number} - rotate speed slider Max */
	Config.rotateSpeedMax = +0.5;
	/** @member {number} - rotate speed slider Now */
	Config.rotateSpeedNow = 0;

	/** @member {number} - palette cycle slider Min */
	Config.paletteSpeedMin = -30.0;
	/** @member {number} - palette cycle slider Max */
	Config.paletteSpeedMax = +30.0;
	/** @member {number} - palette cycle slider Now */
	Config.paletteSpeedNow = 0;

	/** @member {number} - calculation depth slider Min */
	Config.depthMin = 30;
	/** @member {number} - calculation depth slider Max */
	Config.depthMax = 1500;
	/** @member {number} - calculation depth slider Now - MULTIPLE OF 4 */
	Config.depthNow = 1200;

	/** @member {number} - calculation depth slider Min */
	Config.framerateMin = 1;
	/** @member {number} - calculation depth slider Max */
	Config.framerateMax = 60;
	/** @member {number} - calculation depth slider Now */
	Config.framerateNow = 20;

	/** @member {number} - center X coordinate - vsync updated */
	Config.centerX = 0;
	/** @member {number} - center Y coordinate - vsync updated */
	Config.centerY = 0;
	/** @member {number} - distance between center and viewport corner - vsync updated */
	Config.radius = 0;
	/** @member {number} - current viewport angle (degrees) - timer updated */
	Config.angle = 0;
	/** @member {number} - sin(angle) */
	Config.rsin = 0;
	/** @member {number} - cos(angle) */
	Config.rcos = 1;


	/** @member {number} - current palette offset - timer updated */
	Config.paletteOffsetFloat = 0;
	/** @member {number} - Palette size before colours start repeating */
	Config.paletteSize = 0;

	/** @member {number} - current viewport zoomspeed - timer updated */
	Config.zoomSpeed = 0;
	/** @member {number} - After 1sec, get 80% closer to target speed */
	Config.zoomSpeedCoef = 0.80;

	Config.formula = "";
	Config.incolour = "";
	Config.outcolour = "";
	Config.plane = "";

	/** @member {number} - center X coordinate - autopilot updated */
	Config.autopilotX = 0;
	/** @member {number} - center Y coordinate - autopilot updated*/
	Config.autopilotY = 0;
	/** @member {number} - movement gesture - autopilot updated*/
	Config.autopilotButtons = 0;
}

/**
 *  Slider helper, convert linear value `now` to logarithmic
 *
 * @param {number} min
 * @param {number} max
 * @param {number} now
 * @returns {number}
 */
Config.linearToLog = function(min, max, now) {

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
Config.logTolinear = function(min, max, now) {

	var v = 1 + (now - min) * (Math.E - 1) / (max - min);

	return min + Math.log(v) * (max - min);
};

/**
 * set initial position
 */
Config.home = function() {
	if (Formula) {
		var initial = Formula.initial[Formula.formula];

		Config.centerX = initial.x;
		Config.centerY = initial.y;
		Config.radius = initial.r;
		Config.angle = initial.a;
		Config.rsin = Math.sin(Config.angle * Math.PI / 180);
		Config.rcos = Math.cos(Config.angle * Math.PI / 180);

	}
};

/**
 * Frame, used to transport data between workers
 *
 * @constructor
 * @param viewWidth
 * @param viewHeight
 */
function Frame(viewWidth, viewHeight) {

	/** @member {number} - start of round-trip */
	this.now = 0;
	/** @member {number} - duration in worker (not full round-reip) */
	this.msec = 0;

	/** @member {number} - width */
	this.viewWidth = viewWidth;
	/** @member {number} - diameter */
	this.viewHeight = viewHeight;
	/** @member {number} - height */
	this.diameter = Math.ceil(Math.sqrt(viewWidth * viewWidth + viewHeight * viewHeight));
	/** @member {number} - angle */
	this.angle = 0;

	/** @member {ArrayBuffer} - (UINT8x4) red */
	this.paletteBuffer = new ArrayBuffer(65536 * 4);

	/** @member {ArrayBuffer} - (UINT16) pixels */
	this.pixelBuffer = new ArrayBuffer(this.diameter * this.diameter * 2);

	/** @member {ArrayBuffer} - (UINT8x4) RGBA for canvas */
	this.rgbaBuffer = new ArrayBuffer(viewWidth * viewHeight * 4);
}

/**
 * Palette creation
 *
 * NOTE: Palette is always 65536 large (16 bits pixel value)
 * NOTE: color 65535 is always background colour
 *
 * @constructor
 */
function Palette()
{
	/** @member {ArrayBuffer} - palette data */
	this.paletteBuffer = new ArrayBuffer(65536*4);

	/** @member {number} - background red */
	this.backgroundRed = 0;
	/** @member {number} - background green */
	this.backgroundGreen = 0;
	/** @member {number} - background blue */
	this.backgroundBlue = 0;

	/** @var {Uint32Array} - RGBA view of palette */
	var palette32 = new Uint32Array(this.paletteBuffer);
	/** @var {Uint8Array} - R,G,B view of palette */
	var palette8 = new Uint8Array(this.paletteBuffer);

	/**
	 * Create a random number in range 0 <= return < n
	 *
	 * @function
	 * @param n
	 * @returns {number}
	 */
	var random = function(n) {
		return Math.floor(Math.random() * n);
	};

	this.mksmooth = function(nsegments, segmentsize, R, G, B) {
		var i, j, k;

		// set palette modulo size
		Config.paletteSize = nsegments * segmentsize;

		k = 0;
		for (i = 0; i < nsegments; i++) {
			var r = R[i % nsegments];
			var g = G[i % nsegments];
			var b = B[i % nsegments];
			var rs = (R[(i + 1) % nsegments] - r) / segmentsize;
			var gs = (G[(i + 1) % nsegments] - g) / segmentsize;
			var bs = (B[(i + 1) % nsegments] - b) / segmentsize;

			for (j = 0; j < segmentsize; j++) {

				palette8[k++] = Math.floor(r);
				palette8[k++] = Math.floor(g);
				palette8[k++] = Math.floor(b);
				palette8[k++] = 255;

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
					R[i] = random(256);
					G[i] = random(256);
					B[i] = random(256);
				}
				if (i + 1 < nsegments) {
					R[i + 1] = random(35);
					G[i + 1] = random(35);
					B[i + 1] = random(35);
				}
			}
		} else {
			for (i = 0; i < nsegments; i += 2) {
				R[i] = random(35);
				G[i] = random(35);
				B[i] = random(35);
				if (i + 1 < nsegments) {
					R[i + 1] = random(256);
					G[i + 1] = random(256);
					B[i + 1] = random(256);
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
			R[i] = random(256);
			G[i] = random(256);
			B[i] = random(256);
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
				s = random(256);
				h = random(128 - 32);
				v = random(128);
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

	this.mkrandom = function()
	{
		// 85 = 255 / 3
		var segmentsize, nsegments;
		var whitemode = random(2);

		segmentsize  = random(85 + 4);
		segmentsize += random(85 + 4);
		segmentsize += random(85 + 4);
		segmentsize += random(85 + 4);	/* Make smaller segments with higher probability */

		segmentsize = Math.abs(segmentsize >> 1 - 85 + 3);
		if (segmentsize < 8)
			segmentsize = 8;
		if (segmentsize > 85)
			segmentsize = 85;

		switch (random(6)) {
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
				this.randomize_segments1(whitemode, Config.depthNow, 1);
				break;
			case 4:
				this.randomize_segments2(whitemode, Config.depthNow, 1);
				break;
			case 5:
				this.randomize_segments3(whitemode, Config.depthNow, 1);
				break;
		}
	};

	this.mkdefault = function() {
		var gray = [0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff];
		this.mksmooth(16, 1, gray, gray, gray);
	};

	/**
	 * Set paletteBuffer
	 *
	 * @param {ArrayBuffer} paletteBuffer
	 * @param {number} offset
	 */
	this.setPaletteBuffer = function(paletteBuffer, offset) {
		var paletteSize = Config.paletteSize;
		var out32 = new Uint32Array(paletteBuffer);
		var i, j, k;

		// palette offset may not be negative
		if (offset < 0)
			offset = (paletteSize - 1) - (-offset - 1) % paletteSize;
		else
			offset = offset % paletteSize;

		// apply colour cycling
		for (i = 0; i < Config.depthNow; i++) {
			out32[i] = palette32[(offset + i) % paletteSize];
		}

		// background colour
		i = 65535 * 4;
		palette8[i++] = this.backgroundRed;
		palette8[i++] = this.backgroundGreen;
		palette8[i++] = this.backgroundBlue;
		palette8[i++] = 255;
		out32[65535] = palette32[65535];
	};

	/*
	 * Create initial palette
	 */
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
 */
function Viewport(width, height) {

	// don't go zero
	if (width <= 0)
		width = 1;
	if (height <= 0)
		height = 1;

	/** @member {number} - width of viewport */
	this.viewWidth = width;
	/** @member {number} - height of viewport */
	this.viewHeight = height;
	/** @member {number} - diameter of the pixel data */
	this.diameter = Math.ceil(Math.sqrt(this.viewWidth * this.viewWidth + this.viewHeight * this.viewHeight));
	/** @member {Uint16Array} - pixel data (must be square) */
	this.pixels = undefined;

	/** @member {number} - distance between center and horizontal viewport edge (derived from this.radius) */
	this.radiusX = 0;
	/** @member {number} - distance between center and vertical viewport edge  (derived from this.radius) */
	this.radiusY = 0;

	this.xCoord = new Float64Array(this.diameter);
	this.xNearest = new Float64Array(this.diameter);
	this.xError = new Float64Array(this.diameter);
	this.xFrom = new Int32Array(this.diameter);
	this.yCoord = new Float64Array(this.diameter);
	this.yNearest = new Float64Array(this.diameter);
	this.yError = new Float64Array(this.diameter);
	this.yFrom = new Int32Array(this.diameter);

	/*
	 * Static members
	 */
	Viewport.doneX = 0;
	Viewport.doneY = 0;
	Viewport.doneCalc = 0;

	// list of free frames
	Viewport.frames = [];
	// list of pending requestAnimationFrames()
	Viewport.raf = [];

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

	var iOld, iNew, nextError, currError, currCoord;

	/*
	 *
	 */
	iOld = 0;
	for (iNew = 0; iNew < newCoord.length && iOld < oldNearest.length; iNew++) {

		// determine coordinate current tab stop
		currCoord = (end - start) * iNew / (newCoord.length - 1) + start;

		// determine errors
		currError = Math.abs(currCoord - oldNearest[iOld]);
		nextError = Math.abs(currCoord - oldNearest[iOld + 1]);

		// bump if next source stop is better
		while (nextError <= currError && iOld < oldNearest.length - 1) {
			iOld++;
			currError = nextError;
			nextError = Math.abs(currCoord - oldNearest[iOld + 1]);
		}

		// populate
		newCoord[iNew] = currCoord;
		newNearest[iNew] = oldNearest[iOld];
		newError[iNew] = currError;
		newFrom[iNew] = iOld;
	}

	// copy the only option
	while (iNew < newCoord.length) {
		newNearest[iNew] = oldNearest[iOld];
		newError[iNew] = Math.abs(newCoord[iNew] - oldNearest[iOld]);
		newFrom[iNew] = iOld;
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

	/** @var {Frame} frame */
	var frame;

	/*
	 * allocate a new frame
	 */
	do {
		frame = Viewport.frames.shift();
	} while (frame && (frame.viewWidth !== this.viewWidth || frame.viewHeight !== this.viewHeight));

	if (!frame)
		frame = new Frame(this.viewWidth, this.viewHeight);


	this.frame = frame;
	this.frame.angle = angle;
	this.pixels = new Uint16Array(frame.pixelBuffer);

	Config.centerX = x;
	Config.centerY = y;
	Config.radius = radius;
	this.radiusX = radius * this.viewWidth / this.diameter;
	this.radiusY = radius * this.viewHeight / this.diameter;

	// set angle
	Config.angle = angle;
	Config.rsin = Math.sin(angle * Math.PI / 180);
	Config.rcos = Math.cos(angle * Math.PI / 180);

	// window.gui.domStatusQuality.innerHTML = JSON.stringify({x:x, y:y, r:radius, a:angle});

	/*
	 * setup new rulers
	 */
	this.makeRuler(Config.centerX - Config.radius, Config.centerX + Config.radius, this.xCoord, this.xNearest, this.xError, this.xFrom, oldViewport.xNearest, oldViewport.xError);
	this.makeRuler(Config.centerY - Config.radius, Config.centerY + Config.radius, this.yCoord, this.yNearest, this.yError, this.yFrom, oldViewport.yNearest, oldViewport.yError);

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
		if (yFrom[j] === yFrom[j - 1]) {
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

	// keep the froms with lowest error
	for (i = 1; i < newDiameter; i++) {
		if (xFrom[i-1] === xFrom[i] && this.xError[i-1] > this.xError[i])
			xFrom[i-1] = -1;
		if (yFrom[i-1] === yFrom[i] && this.yError[i-1] > this.yError[i])
			yFrom[i-1] = -1;
	}
	for (i = newDiameter-2; i >= 0; i--) {
		if (xFrom[i+1] === xFrom[i] && this.xError[i+1] > this.xError[i])
			xFrom[i+1] = -1;
		if (yFrom[i+1] === yFrom[i] && this.yError[i+1] > this.yError[i])
			yFrom[i+1] = -1;
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

function workerPaint() {
	/**
	 * Extract rotated viewport from pixels and store them in specified imnagedata
	 * The pixel data is palette based, the imagedata is RGB
	 *
	 * @param {MessageEvent} e
	 */
	this.onmessage = function (e) {
		var now = performance.now();
		/** @var {Frame} */
		var request = e.data;

		// typed wrappers for Arrays
		var palette32 = new Uint32Array(request.paletteBuffer);
		var pixels = new Uint16Array(request.pixelBuffer);
		var rgba = new Uint32Array(request.rgbaBuffer);

		var diameter = request.diameter;
		var viewWidth = request.viewWidth;
		var viewHeight = request.viewHeight;
		var angle = request.angle;

		/**
		 **!
		 **! The following loop is a severe performance hit
		 **!
		 **/

		var i, j, u, v, ji, vu, yx;

		if (angle === 0) {
			// FAST extract viewport
			i = (diameter - viewWidth) >> 1;
			j = (diameter - viewHeight) >> 1;

			// copy pixels
			ji = j * diameter + i;
			vu = 0;
			for (v = 0; v < viewHeight; v++) {
				for (u = 0; u < viewWidth; u++)
					rgba[vu++] = palette32[pixels[ji++]];
				ji += diameter - viewWidth;
			}

		} else {
			// SLOW viewport rotation
			var rsin = Math.sin(angle * Math.PI / 180); // sine for viewport angle
			var rcos = Math.cos(angle * Math.PI / 180); // cosine for viewport angle
			var xstart = Math.floor((diameter - viewHeight * rsin - viewWidth * rcos) * 32768);
			var ystart = Math.floor((diameter - viewHeight * rcos + viewWidth * rsin) * 32768);
			var ixstep = Math.floor(rcos * 65536);
			var iystep = Math.floor(rsin * -65536);
			var jxstep = Math.floor(rsin * 65536);
			var jystep = Math.floor(rcos * 65536);
			var x, y, ix, iy;

			// copy pixels
			vu = 0;
			for (j = 0, x = xstart, y = ystart; j < viewHeight; j++, x += jxstep, y += jystep) {
				for (i = 0, ix = x, iy = y; i < viewWidth; i++, ix += ixstep, iy += iystep) {
					rgba[vu++] = palette32[pixels[(iy >> 16) * diameter + (ix >> 16)]];
				}
			}
		}

		request.msec = performance.now() - now;
		this.postMessage(request, [request.paletteBuffer, request.pixelBuffer, request.rgbaBuffer]);
	}
}

/**
 * Extract rotated viewport from pixels and store them in specified imnagedata
 * The pixel data is palette based, the imagedata is RGB
 *
 * @param {ArrayBuffer} paletteBuffer
 * @param {ArrayBuffer} pixelBuffer
 * @param {ArrayBuffer} rgbaBuffer
 */
Viewport.prototype.draw = function(paletteBuffer, pixelBuffer, rgbaBuffer) {

	// make references local
	var palette32 = new Uint32Array(paletteBuffer);
	var pixels = new Uint16Array(pixelBuffer); // pixel data
	var rgba = new Uint32Array(rgbaBuffer); // canvas pixel data

	var diameter = this.diameter; // pixel scanline width (it's square)
	var viewWidth = this.viewWidth; // viewport width
	var viewHeight = this.viewHeight; // viewport height
	var angle = Config.angle;

	/**
	 **!
	 **! The following loop is a severe performance hit
	 **!
	 **/

	var i, j, u, v, ji, vu, yx;

	if (angle === 0) {
		// FAST extract viewport
		i = (diameter - viewWidth) >> 1;
		j = (diameter - viewHeight) >> 1;

		// copy pixels
		ji = j * diameter + i;
		vu = 0;
		for (v = 0; v < viewHeight; v++) {
			for (u = 0; u < viewWidth; u++)
				rgba[vu++] = palette32[pixels[ji++]];
			ji += diameter - viewWidth;
		}

	} else {
		// SLOW viewport rotation
		var rsin = Math.sin(angle * Math.PI / 180); // sine for viewport angle
		var rcos = Math.cos(angle * Math.PI / 180); // cosine for viewport angle
		var xstart = Math.floor((diameter - viewHeight * rsin - viewWidth * rcos) * 32768);
		var ystart = Math.floor((diameter - viewHeight * rcos + viewWidth * rsin) * 32768);
		var ixstep = Math.floor(rcos * 65536);
		var iystep = Math.floor(rsin * -65536);
		var jxstep = Math.floor(rsin * 65536);
		var jystep = Math.floor(rcos * 65536);
		var x, y, ix, iy;

		// copy pixels
		vu = 0;
		for (j = 0, x = xstart, y = ystart; j < viewHeight; j++, x += jxstep, y += jystep) {
			for (i = 0, ix = x, iy = y; i < viewWidth; i++, ix += ixstep, iy += iystep) {
				rgba[vu++] = palette32[pixels[(iy >> 16) * diameter + (ix >> 16)]];
			}
		}
	}
};

/**
 * Simple mandelbrot implementation
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
Viewport.prototype.calculate = function(x, y) {
	var zre = x;
	var zim = y;
	var pre = x;
	var pim = y;

	var iter = 1, maxiter = Config.depthNow;
	var rp, ip;

	do {
		rp = zre * zre;
		ip = zim * zim;

		zim = 2 * zre * zim + pim;
		zre = rp - ip + pre;
		if (rp + ip >= 4)
			return iter;
	} while (++iter < maxiter);

	return 65535;
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

	for (i = 1; i < diameter; i++) {
		if (this.xError[i] > worstXerr) {
			worstXi = i;
			worstXerr = this.xError[i];
		}
	}
	for (j = 1; j < diameter; j++) {
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

	var lo, hi, lasti, lastj, last, oldpx;
	var u, v;
	var xCoord = this.xCoord;
	var xNearest = this.xNearest;
	var xError = this.xError;
	var xFrom = this.xFrom;
	var yCoord = this.yCoord;
	var yNearest = this.yNearest;
	var yError = this.yError;
	var yFrom = this.yFrom;
	var pixels = this.pixels;
	var calculate = Formula.calculate;

	if (worstXerr > worstYerr) {

		i = worstXi;
		x = this.xCoord[i];

		ji = 0 * diameter + i;
		last = calculate(x, this.yCoord[0]);
		pixels[ji] = last;
		ji += diameter;
		Viewport.doneCalc++;
		for (j = 1; j < diameter; j++) {
			/*
			 * Logic would say 'this.yFrom[j] === -1', but haven't been able to figure out why this works better
			 * ..and 3 other places
			 */
			if (yError[j] === 0 || yFrom[j] !== -1) {
				last = calculate(x, yCoord[j]);
				Viewport.doneCalc++;
			}
			pixels[ji] = last;
			ji += diameter;
		}

		for (u=i+1; u < diameter; u++) {
			if (xError[u] === 0 || xFrom[u] !== -1)
				break;

			for (v = 0; v < diameter; v++) {
				pixels[v * diameter + u] = pixels[v * diameter + i];
			}
		}

		xNearest[i] = x;
		xError[i] = 0;
		Viewport.doneX++;

	} else {


		j = worstYj;
		y = yCoord[j];

		ji = j * diameter + 0;
		last = calculate(xCoord[0], y);
		pixels[ji++] = last;
		Viewport.doneCalc++;
		for (i = 1; i < diameter; i++) {
			if (xError[i] === 0 || xFrom[i] !== -1) {
				last = calculate(xCoord[i], y);
				Viewport.doneCalc++;
			}
			pixels[ji++] = last;
		}

		for (v=j+1; v < diameter; v++) {
			if (yError[v] === 0 || yFrom[v] !== -1)
				break;

			for (u = 0; u < diameter; u++) {
				pixels[v * diameter + u] = pixels[j * diameter + u];
			}
		}

		yNearest[j] = y;
		yError[j] = 0;
		Viewport.doneY++;
	}
};

Viewport.prototype.fill = function() {

	this.frame = new Frame(this.viewWidth, this.viewHeight);
	this.pixels = new Uint16Array(this.frame.pixelBuffer);

	this.radiusX = Config.radius * this.viewWidth / this.diameter;
	this.radiusY = Config.radius * this.viewHeight / this.diameter;

	var ji, j, i, y, x;

	for (i = 0; i < this.xCoord.length; i++)
		this.xNearest[i] = this.xCoord[i] = ((Config.centerX + Config.radius) - (Config.centerX - Config.radius)) * i / (this.xCoord.length - 1) + (Config.centerX - Config.radius);
	for (i = 0; i < this.yCoord.length; i++)
		this.yNearest[i] = this.yCoord[i] = ((Config.centerY + Config.radius) - (Config.centerY - Config.radius)) * i / (this.yCoord.length - 1) + (Config.centerY - Config.radius);

	var calculate = Formula.calculate;
	ji = 0;
	for (j = 0; j < this.diameter; j++) {
		y = (Config.centerY - Config.radius) + Config.radius * 2 * j / this.diameter;
		for (i = 0; i < this.diameter; i++) {
			// distance to center
			x = (Config.centerX - Config.radius) + Config.radius * 2 * i / this.diameter;
			this.pixels[ji++] = calculate(x, y);
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
	/** @member {Viewport} - active viewport */
	this.currentViewport = undefined;

	/** @member {number} - Damping coefficient low-pass filter for following fields */
	this.coef = 0.05;
	/** @member {number} - Average time in mSec spent in COPY */
	this.statStateCopy = 0;
	/** @member {number} - Average time in mSec spent in UPDATE */
	this.statStateUpdate = 0;
	/** @member {number} - Average time in mSec spent in PAINT */
	this.statStatePaint1 = 0;
	this.statStatePaint2 = 0;
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
	this.lastTick = 0;
	this.ctx = undefined;
	this.viewport0 = undefined;
	this.viewport1 = undefined;

	// list of web workers
	this.wworkers = [];

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
	this.viewport0 = new Viewport(this.domViewport.clientWidth, this.domViewport.clientHeight);
	this.viewport1 = new Viewport(this.domViewport.clientWidth, this.domViewport.clientHeight);
	this.currentViewport = this.viewport0;

	// small viewport for initial image
	this.viewportInit = new Viewport(64, 64);
	this.viewportInit.fill();
	this.currentViewport.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle, this.viewportInit);

	// create formula engine
	this.calculator = new Formula();

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
		Config.magnificationMin, Config.magnificationMax, Config.magnificationNow);
	this.rotateSpeed = new Aria.Slider(this.domRotateThumb, this.domRotateRail,
		Config.rotateSpeedMin, Config.rotateSpeedMax, Config.rotateSpeedNow);
	this.paletteSpeed = new Aria.Slider(this.domPaletteSpeedThumb, this.domPaletteSpeedRail,
		Config.paletteSpeedMin, Config.paletteSpeedMax, Config.paletteSpeedNow);
	this.depth = new Aria.Slider(this.domDepthThumb, this.domDepthRail,
		Config.depthMin, Config.depthMax, Config.depthNow);
	this.Framerate = new Aria.Slider(this.domFramerateThumb, this.domFramerateRail,
		Config.framerateMin, Config.framerateMax, Config.framerateNow);

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
		newValue = Config.linearToLog(Config.magnificationMin, Config.magnificationMax, newValue);
		Config.magnificationNow = newValue;
		self.domZoomSpeedLeft.innerHTML = newValue.toFixed(2);
	});
	this.rotateSpeed.setCallbackValueChange(function(newValue) {
		Config.rotateSpeedNow = newValue;
		self.domRotateLeft.innerHTML = newValue.toFixed(1);
	});
	this.paletteSpeed.setCallbackValueChange(function(newValue) {
		Config.paletteSpeedNow = newValue;
		self.domPaletteSpeedLeft.innerHTML = newValue.toFixed(0);
	});
	this.depth.setCallbackValueChange(function(newValue) {
		newValue = Math.round(newValue);
		// needs to be a multiple of 4
		newValue = (newValue+3)&~3;
		Config.depthNow = newValue;
		self.domDepthLeft.innerHTML = newValue;
	});
	this.Framerate.setCallbackValueChange(function(newValue) {
		newValue = Math.round(newValue);
		Config.framerateNow = newValue;
		self.domFramerateLeft.innerHTML = newValue;
	});

	// listboxes
	this.formula.listbox.setCallbackFocusChange(function(focusedItem) {
		Config.formula = focusedItem.id;
		this.domFormulaButton.innerText = focusedItem.innerText;
		var formula = focusedItem.id.substr(8) | 0;
		Formula.formula = formula;
		Config.home();
		this.reload();
	}.bind(this));
	this.incolour.listbox.setCallbackFocusChange(function(focusedItem) {
		Config.incolour = focusedItem.id;
		this.domIncolourButton.innerText = focusedItem.innerText;
		var incolour = focusedItem.id.substr(9) | 0;
		Formula.incolour = incolour;
		this.reload();
	}.bind(this));
	this.outcolour.listbox.setCallbackFocusChange(function(focusedItem) {
		Config.outcolour = focusedItem.id;
		this.domOutcolourButton.innerText = focusedItem.innerText;
		var outcolour = focusedItem.id.substr(10) | 0;
		Formula.outcolour = outcolour;
		this.reload();
	}.bind(this));
	this.plane.listbox.setCallbackFocusChange(function(focusedItem) {
		Config.plane = focusedItem.id;
		this.domPlaneButton.innerText = focusedItem.innerText;
		var plane = focusedItem.id.substr(6) | 0;
		Formula.plane = plane;
		Config.home();
		this.reload();

	}.bind(this));

	// buttons
	this.power.setCallbackValueChange(function(newValue) {
		if (newValue)
			self.start(); // power on
		else
			self.stop(); // power off
	});
	this.autoPilot.setCallbackValueChange(function(newValue) {
		Config.autoPilot = newValue;
		if (newValue) {
			self.autopilotOn();
		} else {
			self.autopilotOff();
		}
	});
	this.home.setCallbackValueChange(function(newValue) {
		Config.autopilotX = 0;
		Config.autopilotY = 0;
		Config.home();
		this.reload();
	}.bind(this));

	this.paletteGroup.setCallbackFocusChange(function(newButton) {
		if (newButton.domButton.id === "idRandomPaletteButton") {
			window.palette.mkrandom();
		} else {
			window.palette.mkdefault();
		}
		// fast clamp pixel values
		var viewport = this.currentViewport;
		for (var ji=0; ji<viewport.viewWidth*viewport.viewHeight; ji++)
			if (viewport.pixels[ji] != 65535)
				viewport.pixels[ji] %= Config.paletteSize;
	}.bind(this));

	/*
	 * create 4 workers
	 */
	var dataObj = '(' + workerPaint + ')();'; // here is the trick to convert the above function to string
	var blob = new Blob([dataObj]);
	var blobURL = (window.URL ? URL : webkitURL).createObjectURL(blob);

	// create 4 workers
	for (var i=0; i<4; i++) {
		this.wworkers[i] = new Worker(blobURL);

		this.wworkers[i].onmessage = function (e) {
			/** @var {Frame} */
			var response = e.data;

			// move request to pending requestAnimationFrames()
			Viewport.raf.push(response);
			// request animation
			window.requestAnimationFrame(this.animationFrame);

			// keep track of round trip time
			this.statStatePaint1 += ((performance.now() - response.now) - this.statStatePaint1) * this.coef;
			this.statStatePaint2 += ((response.msec) - this.statStatePaint2) * this.coef;
		}.bind(this);
	}

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
	this.mouseX = dy * Config.rsin + dx * Config.rcos + Config.centerX;
	this.mouseY = dy * Config.rcos - dx * Config.rsin + Config.centerY;

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
	this.vsync = performance.now() + (1000 / Config.framerateNow); // vsync wakeup time
	this.statStateCopy = this.statStateUpdate = this.statStatePaint1 = this.statStatePaint2 = 0;
	window.postMessage("mainloop", "*");
};

/**
 * stop the mainloop
 */
GUI.prototype.stop = function() {
	this.state = 0;
};

/**
 * (re)load initial frame
 */
GUI.prototype.reload = function() {

	// set all pixels of thumbnail
	this.viewportInit.fill();

	// inject into current viewport
	this.currentViewport.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle, this.viewportInit);
};

/**
 * Synchronise screen updates
 *
 * @param {number} time
 */
GUI.prototype.animationFrame = function(time) {
	// paint image onto canvas

	// move request to pending requestAnimationFrames()
	while (Viewport.raf.length) {

		var request = Viewport.raf.shift();
		var rgba = new Uint8ClampedArray(request.rgbaBuffer);
		var imagedata = new ImageData(rgba, request.viewWidth, request.viewHeight);

		// draw frame onto canvas
		this.ctx.putImageData(imagedata, 0, 0);

		// move request to free list
		Viewport.frames.push(request);
	}

	this.statStateRAF += ((performance.now() - this.rafTime) - this.statStateRAF) * this.coef;
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
		this.vsync = now + (1000 / Config.framerateNow);
		this.lastTick = now;
		this.state = 1;
		console.log("resync");
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
			this.state = 1;
			this.vsync += (1000 / Config.framerateNow); // time of next vsync
			this.rafTime = now;
		} else {
			window.postMessage("mainloop", "*");
			return true;
		}
	}

	/**
	***
	*** Start of new cycle
	***
	**/
	this.counters[1]++;
	last = now;

	// seconds since last cycle
	var diffSec = (now - this.lastTick) / 1000;
	this.lastTick = now;

	if (Config.autoPilot) {
		if (this.frameNr & 1) {
			if (this.viewport1.reachedLimits()) {
				Config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_RIGHT;
				window.gui.domAutopilot.style.border = '4px solid orange';
			} else {
				this.domStatusQuality.innerHTML = "";
				if (!this.viewport1.updateAutopilot(4, 16))
					if (!this.viewport1.updateAutopilot(60, 16))
						if (!this.viewport1.updateAutopilot(this.viewport1.diameter >> 1, 16))
							Config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_RIGHT;
			}
		} else {
			if (this.viewport0.reachedLimits()) {
				Config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_RIGHT;
				window.gui.domAutopilot.style.border = '4px solid orange';
			} else {
				this.domStatusQuality.innerHTML = "";
				if (!this.viewport0.updateAutopilot(4, 16))
					if (!this.viewport0.updateAutopilot(60, 16))
						if (!this.viewport0.updateAutopilot(this.viewport0.diameter >> 1, 16))
							Config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_RIGHT;
			}
		}

		this.mouseX = Config.autopilotX;
		this.mouseY = Config.autopilotY;
		this.mouseButtons = Config.autopilotButtons;
	}

	/*
	 * Update zoom (de-)acceleration. -1 <= zoomSpeed <= +1
	 */
	if (this.mouseButtons === (1 << Aria.ButtonCode.BUTTON_LEFT)) {
		// zoom-in only
		Config.zoomSpeed = +1 - (+1 - Config.zoomSpeed) * Math.pow((1 - Config.zoomSpeedCoef), diffSec);
	} else if (this.mouseButtons === (1 << Aria.ButtonCode.BUTTON_RIGHT)) {
		// zoom-out only
		Config.zoomSpeed = -1 - (-1 - Config.zoomSpeed) * Math.pow((1 - Config.zoomSpeedCoef), diffSec);
	} else if (this.mouseButtons === 0) {
		// buttons released
		Config.zoomSpeed = Config.zoomSpeed * Math.pow((1 - Config.zoomSpeedCoef), diffSec);

		if (Config.zoomSpeed >= -0.001 && Config.zoomSpeed < +0.001)
			Config.zoomSpeed = 0; // full stop
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

		// create new viewports
		this.viewport0 = new Viewport(domViewport.clientWidth, domViewport.clientHeight);
		this.viewport1 = new Viewport(domViewport.clientWidth, domViewport.clientHeight);

		// copy the contents
		if (this.frameNr & 1) {
			this.viewport1.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle, oldViewport1);
			this.currentViewport = this.viewport1;
		} else {
			this.viewport0.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle, oldViewport0);
			this.currentViewport = this.viewport0;
		}

		// update GUI
		this.domWxH.innerHTML = "[" + domViewport.clientWidth + "x" + domViewport.clientHeight + "]";
	}

	/*
	 * Update palette cycle offset
	 */
	if (Config.paletteSpeedNow)
		Config.paletteOffsetFloat -= diffSec * Config.paletteSpeedNow;

	/*
	 * Update viewport angle (before zoom gestures)
	 */
	if (Config.rotateSpeedNow)
		Config.angle += diffSec * Config.rotateSpeedNow * 360;

	// drag gesture
	if (this.mouseButtons === (1 << Aria.ButtonCode.BUTTON_WHEEL)) {
		// need screen coordinates to avoid drifting
		// relative to viewport center
		var dx = this.mouseI * viewport.radiusX * 2 / viewport.viewWidth - viewport.radiusX;
		var dy = this.mouseJ * viewport.radiusY * 2 / viewport.viewHeight - viewport.radiusY;
		// undo rotation
		var x = dy * Config.rsin + dx * Config.rcos + Config.centerX;
		var y = dy * Config.rcos - dx * Config.rsin + Config.centerY;

		if (!this.dragActive) {
			// save the fractal coordinate of the mouse position. that stays constant during the drag gesture
			this.dragActiveX = x;
			this.dragActiveY = y;
			this.dragActive = true;
		}

		// update x/y but keep radius
		Config.centerX = Config.centerX - x + this.dragActiveX;
		Config.centerY = Config.centerY - y + this.dragActiveY;
	} else {
		this.dragActive = false;
	}

	// zoom-in/out gesture
	if (Config.zoomSpeed) {
		// convert normalised zoom speed (-1<=speed<=+1) to magnification and scale to this time interval
		var magnify = Math.pow(Config.magnificationNow, Config.zoomSpeed * diffSec);

		// zoom, The mouse pointer coordinate should not change
		Config.centerX = (Config.centerX - this.mouseX) / magnify + this.mouseX;
		Config.centerY = (Config.centerY - this.mouseY) / magnify + this.mouseY;
		Config.radius  = Config.radius / magnify;
	}

	this.domStatusQuality.innerHTML = JSON.stringify({lines:Viewport.doneX+Viewport.doneY, calc: Viewport.doneCalc,
	x: Config.centerX.toFixed(3), y: Config.centerY.toFixed(3), r: Config.radius.toFixed(3)});
	Viewport.doneX = 0;
	Viewport.doneY = 0;
	Viewport.doneCalc = 0;

	var oldViewport = this.currentViewport;
	var oldFrame = oldViewport.frame;

	/*
	 * COPY
	 */

	this.frameNr++;

	if (this.frameNr & 1) {
		this.viewport1.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle, this.viewport0);
		this.currentViewport = this.viewport1;
	} else {
		this.viewport0.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle, this.viewport1);
		this.currentViewport = this.viewport0;
	}

	/*
	 * Create palette
	 */
	oldFrame.now = performance.now();

	// inject palette into frame
	palette.setPaletteBuffer(oldFrame.paletteBuffer, Math.round(Config.paletteOffsetFloat));

	/*
	 * The message queue is overloaded, so call direct until improved design
	 */
	if (1) {
		oldViewport.draw(oldFrame.paletteBuffer, oldFrame.pixelBuffer, oldFrame.rgbaBuffer);
		Viewport.raf.push(oldFrame);
		window.requestAnimationFrame(this.animationFrame);
		this.statStatePaint1 += ((performance.now() - oldFrame.now) - this.statStatePaint1) * this.coef;
		this.statStatePaint2 += ((oldFrame.msec) - this.statStatePaint2) * this.coef;
	} else {
		this.wworkers[this.frameNr&3].postMessage(oldFrame, [oldFrame.paletteBuffer, oldFrame.pixelBuffer, oldFrame.rgbaBuffer]);
	}

	/*
	 * update stats
	 */
	now = performance.now();
	this.statStateCopy += ((now - last) - this.statStateCopy) * this.coef;

	// window.gui.domStatusQuality.innerHTML = JSON.stringify(this.counters);

	this.domStatusRect.innerHTML =
		"zoom:" + this.statStateCopy.toFixed(3) +
		"mSec("+ (this.statStateCopy*100/(1000 / Config.framerateNow)).toFixed(0) +
		"%), update:" + this.statStateUpdate.toFixed(3) +
		"mSec, paint:" + this.statStatePaint1.toFixed(3) +
		"mSec("+ (this.statStatePaint1*100/(1000 / Config.framerateNow)).toFixed(0) +
		"%)+"+this.statStatePaint2.toFixed(3)+", rAF:" + this.statStateRAF.toFixed(3) ;

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
	var api = ((Config.autopilotX - Config.centerX) / Config.radius + 1) * this.diameter >> 1;
	var apj = ((Config.autopilotY - Config.centerY) / Config.radius + 1) * this.diameter >> 1;

	var min = ((borderPixelRadius + 1) * (borderPixelRadius + 1)) >> 2;
	var max = min * 3;


		// outside center rectangle, adjust autopilot heading
		for (var k = 0; k < 450; k++) {
			var i0 = api + Math.floor(Math.random() * (2 * lookPixelRadius)) - lookPixelRadius;
			var j0 = apj + Math.floor(Math.random() * (2 * lookPixelRadius)) - lookPixelRadius;
			// convert to x/y
			var x = (i0 / this.diameter * 2 - 1) * Config.radius + Config.centerX;
			var y = (j0 / this.diameter * 2 - 1) * Config.radius + Config.centerY;
			// convert to viewport coords (use '>>1' as integer '/2'
			var i = (((x - Config.centerX) * Config.rcos - (y - Config.centerY) * Config.rsin + this.radiusX) * this.viewWidth / this.radiusX) >> 1;
			var j = (((x - Config.centerX) * Config.rsin + (y - Config.centerY) * Config.rcos + this.radiusY) * this.viewHeight / this.radiusY) >> 1;
			// must be visable
			if (i < borderPixelRadius || j < borderPixelRadius || i >= this.viewWidth-borderPixelRadius || j >= this.viewHeight-borderPixelRadius)
				continue;

			var c = 0;
			for (j = j0 - borderPixelRadius; j <= j0 + borderPixelRadius; j++)
				for (i = i0 - borderPixelRadius; i <= i0 + borderPixelRadius; i++)
					if (pixels[j * this.diameter + i] === 65535)
						c++;
			if (c >= min && c <= max) {
				Config.autopilotX = x;
				Config.autopilotY = y;
				Config.autopilotButtons = 1<<Aria.ButtonCode.BUTTON_LEFT;

				var i = (((x - Config.centerX) * Config.rcos - (y - Config.centerY) * Config.rsin + this.radiusX) * this.viewWidth / this.radiusX) >> 1;
				var j = (((x - Config.centerX) * Config.rsin + (y - Config.centerY) * Config.rcos + this.radiusY) * this.viewHeight / this.radiusY) >> 1;
				window.gui.domAutopilot.style.top = (j - borderPixelRadius)+"px";
				window.gui.domAutopilot.style.left = (i - borderPixelRadius)+"px";
				window.gui.domAutopilot.style.width = (borderPixelRadius*2)+"px";
				window.gui.domAutopilot.style.height = (borderPixelRadius*2)+"px";
				window.gui.domAutopilot.style.border = '4px solid green';
				return true;
			}
		}

	Config.autopilotButtons = 0;
	window.gui.domAutopilot.style.border = '4px solid red';
	return false;
};

GUI.prototype.autopilotOn = function() {

	var viewport = (this.frameNr & 1) ? this.viewport1 : this.viewport0;
	Config.autopilotX = Config.centerX;
	Config.autopilotY = Config.centerY;

	var lookPixelRadius = viewport.diameter >> 1;
	var borderPixelRadius = viewport.diameter >> 5;
	do {
		if (!viewport.updateAutopilot(lookPixelRadius, 16))
			break;
		lookPixelRadius >>= 1;
	} while (lookPixelRadius > 2);
};

GUI.prototype.autopilotOff = function() {
	this.mouseButtons = 0;
	this.domAutopilot.style.border = 'none';

};
