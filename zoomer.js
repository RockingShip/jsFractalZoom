/*
 *  This file is part of jsFractalZoom - Fractal zoomer and splash video codec
 *
 *  Copyright (C) 2020, xyzzy@rockingship.org
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

"use strict";

/**
 * zoomerMemcpy Accelerated array copy.
 *
 * @param {ArrayBuffer} dst       - Destination array
 * @param {int}         dstOffset - Starting offset in destination
 * @param {ArrayBuffer} src       - Source array
 * @param {int}         srcOffset - Starting offset in source
 * @param {int}         length    - Number of elements to be copyied
 */
function zoomerMemcpy(dst, dstOffset, src, srcOffset, length) {
	src = src.subarray(srcOffset, srcOffset + length);
	dst.set(src, dstOffset);
}

/*
 * todo: this needs updating
 *
 * Timing considerations
 *
 * Constructing a frame is a time consuming process that would severely impair the event/messaging queues and vsync.
 * To make the code more responsive, frame constructing is split into 4 phases:
 *
 * - COPY, pre-fill a frame with data from a previous frame.
 * 	The time required depends on window size and magnification factor (zoom speed).
 * 	Times are unstable and can vary between 1 and 15mSec, typically 15mSec
 *
 * - UPDATE, improve quality by recalculating inaccurate pixels
 * 	The time required depends on window size and magnification factor.
 * 	Times are fairly short, typically well under 1mSec.
 * 	In contrast to COPY/PAINT which are called once and take long
 * 	UPDATES are many and take as short as possible to keep the system responsive.
 *
 * - IDLE, wait until animationEndFrameCallback triggers an event (VSYNC)
 *      Waiting makes the event queue maximum responsive.
 *
 * - PAINT, Create RGBA imagedata ready to be written to DOM canvas
 * 	The time required depends on window size and rotation angle.
 * 	Times are fairly stable and can vary between 5 and 15mSec, typically 12mSec.
 *
 * There is also an optional embedded IDLE state. No calculations are performed 2mSec before a vsync,
 * so that the event/message queues are highly responsive to the handling of requestAnimationFrame()
 * for worst case situations that a long UPDATE will miss the vsync (animationEndFrameCallback).
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

/**
 * Set the center coordinate and radius.
 *
 * @callback Calculator
 * @param {float}   x	- Center x of view
 * @param {float}   y	- Center y or view
 * @return {int} - RGBA value for pixel
 */

/**
 * Frame, used to transport data between workers
 *
 * NOTE: pixelWH must me less/equal than viewWH
 * NOTE: data only, do not include functions to minimize transport overhead
 *
 * @class
 * @param {int}   viewWidth   - Screen width (pixels)
 * @param {int}   viewHeight  - Screen height (pixels)
 * @param {int}   pixelWidth  - Storage width (pixels)
 * @param {int}   pixelHeight - Storage Height (pixels)
 */
function ZoomerFrame(viewWidth, viewHeight, pixelWidth, pixelHeight) {

	/** @member {int}
	    @description Display width (pixels) */
	this.viewWidth = viewWidth;

	/** @member {int}
	    @description display height (pixels) */
	this.viewHeight = viewHeight;

	/** @member {int}
	    @description data width (pixels) */
	this.pixelWidth = pixelWidth;

	/** @member {int}
	    @description data height (pixels) */
	this.pixelHeight = pixelHeight;

	/** @member {float}
	    @description Rotational angle (degrees) */
	this.angle = 0;

	/** @member {Uint32Array}
	    @description Canvas pixel buffer */
	this.rgba = new Uint32Array(viewWidth * viewHeight);

	/** @member {Uint16Array}
	    @description Pixels */
	this.pixels = this.palette ? new Uint16Array(pixelWidth * pixelHeight) : new Uint32Array(pixelWidth * pixelHeight);

	/** @member {Uint32Array}
	    @description Worker RGBA palette */
	this.palette = null;

	/** @member {float}
	    @description Expire time. To protect against queue overloading. Use Date.now() because that is synced between workers. */
	this.timeExpire = 0;

	/** @member {int}
	    @description Frame number. */
	this.frameNr = 0;

	/*
	 * Statistics
	 */

	/** @member {int}
	    @description Timestamp of `allocFrame()` */
	this.timeStart = 0;

	/** @member {int}
	    @description Timestamp after `onPutImageData()` */
	this.timeEnd = 0;

	/** @member {int}
	    @description Time of `COPY`  */
	this.durationCOPY = 0;

	/** @member {int}
	    @description Time of `UPDATE`  */
	this.durationUPDATE = 0;

	/** @member {int}
	    @description Time of `RENDER`  */
	this.durationRENDER = 0;

	/** @member {int}
	    @description Time of `PAINT`  */
	this.durationPAINT = 0;

	/** @member {int}
	    @description Worker round-trip time */
	this.durationRoundTrip = 0;

	/** @member {int}
	    @description number of calculated pixels */
	this.cntPixels = 0;

	/** @member {int}
	    @description number of horizontal lines */
	this.cntHLines = 0;

	/** @member {int}
	    @description number of vertical lines */
	this.cntVLines = 0;

	/** @member {float}
	    @description Completion. Randing from 0 to 1. */
	this.complete = 0;
}

/**
 * Extract rotated view from pixels and store them in specified imagedata
 * The pixel data is palette based, the imagedata is RGB
 *
 * @param {ZoomerFrame} frame
 */
function zoomerRenderFrame(frame) {

	/*
	 * Test for overloading
	 */
	if (Date.now() >= frame.timeExpire) {
		frame.durationRENDER = 0; // not rendered
		return;
	}

	const stime = performance.now();

	/**
	 **!
	 **! The following loop is a severe performance hit
	 **!
	 **/

	const {viewWidth, viewHeight, pixelWidth, pixelHeight, angle, rgba, pixels, palette} = frame;

	if (angle === 0) {

		// FAST extract view
		let i = (pixelWidth - viewWidth) >> 1;
		let j = (pixelHeight - viewHeight) >> 1;

		// copy pixels
		let ji = j * pixelWidth + i;
		let vu = 0;

		if (palette) {
			// Palette translated
			for (let v = 0; v < viewHeight; v++) {
				for (let u = 0; u < viewWidth; u++)
					rgba[vu++] = palette[pixels[ji++]];
				ji += pixelWidth - viewWidth;
			}
		} else if (pixelWidth === viewWidth) {
			// 1:1
			zoomerMemcpy(rgba, vu, pixels, ji, viewWidth * viewHeight);
		} else {
			// cropped
			for (let v = 0; v < viewHeight; v++) {
				zoomerMemcpy(rgba, vu, pixels, ji, viewWidth);
				vu += viewWidth;
				ji += viewWidth;

				ji += pixelWidth - viewWidth;
			}
		}

	} else {

		// SLOW view rotation
		// Loop unroll slating increments
		// Fixed point floats
		// with 4K displays rounding errors are negligible.
		const rsin = Math.sin(angle * Math.PI / 180); // sine for view angle
		const rcos = Math.cos(angle * Math.PI / 180); // cosine for view angle
		const xstart = Math.floor((pixelWidth - viewHeight * rsin - viewWidth * rcos) * 32768);
		const ystart = Math.floor((pixelHeight - viewHeight * rcos + viewWidth * rsin) * 32768);
		const ixstep = Math.floor(rcos * 65536);
		const iystep = Math.floor(rsin * -65536);
		const jxstep = Math.floor(rsin * 65536);
		const jystep = Math.floor(rcos * 65536);

		// copy pixels
		let vu = 0;

		if (palette) {
			for (let j = 0, x = xstart, y = ystart; j < viewHeight; j++, x += jxstep, y += jystep) {
				for (let i = 0, ix = x, iy = y; i < viewWidth; i++, ix += ixstep, iy += iystep) {
					rgba[vu++] = palette[pixels[(iy >> 16) * pixelWidth + (ix >> 16)]];
				}
			}
		} else {
			for (let j = 0, x = xstart, y = ystart; j < viewHeight; j++, x += jxstep, y += jystep) {
				for (let i = 0, ix = x, iy = y; i < viewWidth; i++, ix += ixstep, iy += iystep) {
					rgba[vu++] = pixels[(iy >> 16) * pixelWidth + (ix >> 16)];
				}
			}
		}
	}

	frame.durationRENDER = performance.now() - stime;
};

/**
 * View to the fractal world.
 *
 * When using angles:
 * The frame must be square and its size must be the diagonal of the viewing area.
 *
 * Coordinate system is the center x,y and radius. Angle is part of `Frame` rendering.
 *
 * @class
 * @param {int}   viewWidth     - Screen width (pixels)
 * @param {int}   viewHeight    - Screen height (pixels)
 * @param {int}   [pixelWidth]  - Frame width (pixels)
 * @param {int}   [pixelHeight] - Frame height (pixels)
 */
function ZoomerView(viewWidth, viewHeight, pixelWidth, pixelHeight) {

	/** @member {number} - width of view */
	this.viewWidth = viewWidth;

	/** @member {number} - height of view */
	this.viewHeight = viewHeight;

	/** @member {int}
	    @description data width (pixels) */
	this.pixelWidth = pixelWidth ? pixelWidth : viewWidth;

	/** @member {int}
	    @description data height (pixels) */
	this.pixelHeight = pixelHeight ? pixelHeight : viewHeight;

	/** @member {ZoomerFrame}
	    @description Frame being managed */
	this.frame = undefined;

	/** @member {Uint16Array}
	    @description Direct reference to frame pixels */
	this.pixels = undefined;

	/*
	 * Visual center
	 */

	/** @member {float}
	    @description Center X coordinate */
	this.centerX = 0;

	/** @member {float}
	    @description Center Y coordinate */
	this.centerY = 0;

	/** @member {float}
	    @description Distance between center and view corner */
	this.radius = 0;

	/*
	 * Rulers
	 */

	/** @member {Float64Array}
	    @description Logical x coordinate, what it should be */
	this.xCoord = new Float64Array(this.pixelWidth);

	/** @member {Float64Array}
	    @description Physical x coordinate, the older there larger the drift */
	this.xNearest = new Float64Array(this.pixelWidth);

	/** @member {Float64Array}
	    @description Cached distance between Logical/Physical */
	this.xScore = new Float64Array(this.pixelWidth);

	/** @member {Int32Array}
	    @description Inherited index from previous update */
	this.xFrom = new Int32Array(this.pixelWidth);

	/** @member {Float64Array}
	    @description Logical y coordinate, what it should be */
	this.yCoord = new Float64Array(this.pixelHeight);

	/** @member {Float64Array}
	    @description Physical y coordinate, the older there larger the drift */
	this.yNearest = new Float64Array(this.pixelHeight);

	/** @member {Float64Array}
	    @description Cached distance between Logical/Physical */
	this.yScore = new Float64Array(this.pixelHeight);

	/** @member {Int32Array}
	    @description Inherited index from previous update */
	this.yFrom = new Int32Array(this.pixelHeight);

	/**
	 *
	 * @param {number}       start      - start coordinate
	 * @param {number}       end        - end coordinate
	 * @param {Float64Array} newCoord   - coordinate stops
	 * @param {Float64Array} newNearest - nearest evaluated coordinate stop
	 * @param {Float64Array} newScore   - difference between newCoord[] and newNearest[]
	 * @param {Uint16Array}  newFrom    - matching oldNearest[] index
	 * @param {Float64Array} oldNearest - source ruler
	 * @param {Float64Array} oldScore   - source ruler
	 */
	this.makeRuler = (start, end, newCoord, newNearest, newScore, newFrom, oldNearest, oldScore) => {

		/*
		 *
		 */
		let cntExact = 0;

		let iOld, iNew;
		for (iOld = 0, iNew = 0; iNew < newCoord.length && iOld < oldNearest.length; iNew++) {

			// determine coordinate current tab stop
			const currCoord = (end - start) * iNew / (newCoord.length - 1) + start;

			// determine scoring. 0=exact
			let currScore = Math.abs(currCoord - oldNearest[iOld]);
			let nextScore = Math.abs(currCoord - oldNearest[iOld + 1]);

			// bump if next source stop is better
			while (nextScore <= currScore && iOld < oldNearest.length - 1) {
				iOld++;
				currScore = nextScore;
				nextScore = Math.abs(currCoord - oldNearest[iOld + 1]);
			}

			if (currScore === 0)
				cntExact++;

			// populate
			newCoord[iNew] = currCoord;
			newNearest[iNew] = oldNearest[iOld];
			newScore[iNew] = currScore;
			newFrom[iNew] = iOld;
		}

		// copy the only option
		while (iNew < newCoord.length) {
			newNearest[iNew] = oldNearest[iOld];
			newScore[iNew] = Math.abs(newCoord[iNew] - oldNearest[iOld]);
			newFrom[iNew] = iOld;
			iNew++;
		}

		return cntExact;
	};

	/**
	 * Set the center coordinate and radius.
	 * Inherit pixels from oldView based on rulers.
	 * Previous view/frame may have different dimensions.
	 *
	 * @param {ZoomerFrame} frame		   - Current frame
	 * @param {float}    centerX		- Center x of view
	 * @param {float}    centerY		- Center y or view
	 * @param {float}    radius		- Radius of view
	 * @param {ZoomerView}  [previousView] - Previous frame to inherit pixels from
	 */
	this.setPosition = (frame, centerX, centerY, radius, previousView) => {

		// deep link into frame
		this.frame = frame;
		this.pixels = frame.pixels;

		const {xCoord, xNearest, xScore, xFrom, yCoord, yNearest, yScore, yFrom, viewWidth, viewHeight, pixelWidth, pixelHeight, pixels} = this;

		this.centerX = centerX;
		this.centerY = centerY;
		this.radius = radius;

		// Determine the radius of the borders
		// NOTE: this determines the aspect ration
		let radiusPixelHor, radiusPixelVer;
		if (this.viewWidth > this.viewHeight) {
			// landscape
			radiusPixelVer = radius * pixelHeight / viewHeight;
			radiusPixelHor = radius * pixelWidth / viewHeight;
		} else {
			// portrait
			radiusPixelHor = radius * pixelWidth / viewWidth;
			radiusPixelVer = radius * pixelHeight / viewWidth;
		}

		const pixelMinX = centerX - radiusPixelHor;
		const pixelMaxX = centerX + radiusPixelHor;
		const pixelMinY = centerY - radiusPixelVer;
		const pixelMaxY = centerY + radiusPixelVer;

		if (!previousView) {
			// simple linear fill of rulers
			for (let i = 0; i < xCoord.length; i++) {
				xNearest[i] = xCoord[i] = i * (pixelMaxX - pixelMinX) / xCoord.length + pixelMinX;
				xScore[i] = 0;
				xFrom[i] = -1;
			}
			for (let j = 0; j < yCoord.length; j++) {
				yNearest[j] = yCoord[j] = j * (pixelMaxY - pixelMinY) / yCoord.length + pixelMinY;
				yScore[j] = 0;
				yFrom[j] = -1;
			}

			return;
		}

		const {xNearest: oldXnearest, xScore: oldXscore, yNearest: oldYnearest, yNearest: oldYscore, pixelWidth: oldPixelWidth, pixelHeight: oldPixelHeight, pixels: oldPixels} = previousView;

		// setup new rulers
		const exactX = this.makeRuler(centerX - radiusPixelHor, centerX + radiusPixelHor, xCoord, xNearest, xScore, xFrom, previousView.xNearest, previousView.xScore);
		const exactY = this.makeRuler(centerY - radiusPixelVer, centerY + radiusPixelVer, yCoord, yNearest, yScore, yFrom, previousView.yNearest, previousView.yScore);

		frame.cntPixels += exactX * exactY;
		frame.cntHLines += exactX;
		frame.cntVLines += exactY;

		/**
		 **!
		 **! The following loop is a severe performance hit
		 **!
		 **/

		/*
		 * copy/inherit pixels TODO: check oldPixelHeight
		 */
		let ji = 0;

		// first line
		let k = yFrom[0] * oldPixelWidth;
		for (let i = 0; i < pixelWidth; i++)
			pixels[ji++] = oldPixels[k + xFrom[i]];

		// followups
		for (let j = 1; j < pixelHeight; j++) {
			if (yFrom[j] === yFrom[j - 1]) {
				// this line is identical to the previous
				const k = ji - pixelWidth;

				// for (let i = 0; i < pixelWidth; i++)
				//         pixels[ji++] = pixels[k++];
				pixels.copyWithin(ji, k, k + pixelWidth);
				ji += pixelWidth;

			} else {
				// extract line from previous frame
				let k = yFrom[j] * oldPixelWidth;
				for (let i = 0; i < pixelWidth; i++)
					pixels[ji++] = oldPixels[k + xFrom[i]];
			}
		}

		// keep the `From`s with lowest score
		for (let i = 1; i < pixelWidth; i++) {
			if (xFrom[i - 1] === xFrom[i] && xScore[i - 1] > xScore[i])
				xFrom[i - 1] = -1;
		}
		for (let j = 1; j < pixelHeight; j++) {
			if (yFrom[j - 1] === yFrom[j] && yScore[j - 1] > yScore[j])
				yFrom[j - 1] = -1;
		}
		for (let i = pixelWidth - 2; i >= 0; i--) {
			if (xFrom[i + 1] === xFrom[i] && xScore[i + 1] > xScore[i])
				xFrom[i + 1] = -1;
		}
		for (let j = pixelHeight - 2; j >= 0; j--) {
			if (yFrom[j + 1] === yFrom[j] && yScore[j + 1] > yScore[j])
				yFrom[j + 1] = -1;
		}

		// update completion
		frame.complete = frame.cntPixels / (frame.pixelWidth * frame.pixelHeight);
	};

	/**
	 * Test if rulers have reached resolution limits
	 *
	 * @returns {boolean}
	 */
	this.reachedLimits = () => {

		const {xCoord, yCoord, pixelWidth} = this;
		/*
		 * @date 2020-10-12 18:30:14
		 * NOTE: First duplicate ruler coordinate is sufficient to mark endpoint.
		 *       This to prevent zooming full screen into a single pixel
		 */
		for (let i = 1; i < pixelWidth; i++) {
			if (xCoord[i - 1] === xCoord[i])
				return true;

		}
		for (let j = 1; j < pixelHeight; j++) {
			if (yCoord[j - 1] === yCoord[j])
				return true;

		}
		return false;
	};

	/**
	 * Simple background renderer
	 *
	 * @param {Zoomer} zoomer
	 * @return {int} number of lines updated
	 */
	this.updateLines = (zoomer) => {

		const {xCoord, xNearest, xScore, xFrom, yCoord, yNearest, yScore, yFrom, pixels, pixelWidth, pixelHeight} = this;

		// which tabstops have the worst score
		let worstXerr = xScore[0];
		let worstXi = 0;
		let worstYerr = yScore[0];
		let worstYj = 0;

		for (let i = 1; i < pixelWidth; i++) {
			if (xScore[i] > worstXerr) {
				worstXi = i;
				worstXerr = xScore[i];
			}
		}
		for (let j = 1; j < pixelHeight; j++) {
			if (yScore[j] > worstYerr) {
				worstYj = j;
				worstYerr = yScore[j];
			}
		}

		if (worstXerr + worstYerr === 0)
			return 0; // nothing to do

		/**
		 **!
		 **! The following loop is a severe performance hit
		 **!
		 **/

		const frame = this.frame;

		if (worstXerr > worstYerr) {

			let i = worstXi;
			let x = xCoord[i];

			let result = zoomer.onUpdatePixel(zoomer, frame, x, yCoord[0]);
			if (yScore[0] === 0 || yFrom[0] !== -1)
				frame.cntPixels++;

			let ji = 0 * pixelWidth + i;
			pixels[ji] = result;
			ji += pixelWidth;

			for (let j = 1; j < pixelHeight; j++) {
				// only calculate cross points of exact lines, fill the others
				if (yScore[j] === 0 || yFrom[j] !== -1) {
					result = zoomer.onUpdatePixel(zoomer, frame, x, yCoord[j]);
					frame.cntPixels++;
				}

				pixels[ji] = result;
				ji += pixelWidth;
			}

			for (let u = i + 1; u < pixelWidth; u++) {
				if (xScore[u] === 0 || xFrom[u] !== -1)
					break;

				for (let v = 0; v < pixelHeight; v++) {
					pixels[v * pixelWidth + u] = pixels[v * pixelWidth + i];
				}
			}

			xNearest[i] = x;
			xScore[i] = 0;
			frame.cntHLines++;

		} else {

			let j = worstYj;
			let y = yCoord[j];

			let result = zoomer.onUpdatePixel(zoomer, frame, xCoord[0], y);
			if (xScore[0] === 0 || xFrom[0] !== -1)
				frame.cntPixels++;

			let ji = j * pixelWidth + 0;
			pixels[ji++] = result;

			for (let i = 1; i < pixelWidth; i++) {
				// only calculate cross points of exact lines, fill the others
				if (xScore[i] === 0 || xFrom[i] !== -1) {
					result = zoomer.onUpdatePixel(zoomer, frame, xCoord[i], y);
					frame.cntPixels++;
				}
				pixels[ji++] = result;
			}

			for (let v = j + 1; v < pixelHeight; v++) {
				if (yScore[v] === 0 || yFrom[v] !== -1)
					break;

				// for (let u = 0; u < pixelWidth; u++)
				// 	pixels[v * pixelWidth + u] = pixels[j * pixelWidth + u];
				const v0 = v * pixelWidth;
				const j0 = j * pixelWidth;
				pixels.copyWithin(v0, j0, j0 + pixelWidth);
			}

			yNearest[j] = y;
			yScore[j] = 0;
			frame.cntVLines++;
		}

		// update completion
		frame.complete = frame.cntPixels / (frame.pixelWidth * frame.pixelHeight);
		return 1;
	};

	/**
	 * brute-force fill of all pixels. Intended for small/initial view
	 *
	 * @param {float}    centerX       - Center x of view
	 * @param {float}    centerY       - Center y or view
	 * @param {float}    radius        - Radius of view
	 * @param {float}    angle         - Angle (degrees) [not tested]
	 * @param {Zoomer}   zoomer        - Caller context
	 * @param {function} onUpdatePixel - Called to calculate pixel values.
	 */
	this.fill = (centerX, centerY, radius, angle, zoomer, onUpdatePixel) => {

		const {viewWidth, viewHeight, pixelWidth, pixelHeight} = this;

		this.centerX = centerX;
		this.centerY = centerY;
		this.radius = radius;

		// Determine the radius of the view
		if (this.viewWidth > this.viewHeight) {
			this.radiusHor = radius * this.viewWidth / this.viewHeight;
			this.radiusVer = radius;
		} else {
			this.radiusHor = radius;
			this.radiusVer = radius * this.viewHeight / this.viewWidth;
		}

		// NOTE: current attached frame will leak and GC
		this.frame = zoomer.allocFrame(viewWidth, viewHeight, pixelWidth, pixelHeight, angle);
		this.pixels = this.frame.pixels;

		const {xCoord, xNearest, yCoord, yNearest, pixels} = this;

		for (let i = 0; i < xCoord.length; i++)
			xNearest[i] = xCoord[i] = ((centerX + this.radius) - (centerX - this.radius)) * i / (xCoord.length - 1) + (centerX - this.radius);
		for (let i = 0; i < yCoord.length; i++)
			yNearest[i] = yCoord[i] = ((centerY + this.radius) - (centerY - this.radius)) * i / (yCoord.length - 1) + (centerY - this.radius);

		let ji = 0;
		for (let j = 0; j < pixelHeight; j++) {
			const y = (centerY - this.radius) + this.radius * 2 * j / pixelHeight;
			for (let i = 0; i < pixelWidth; i++) {
				// distance to center
				const x = (centerX - this.radius) + this.radius * 2 * i / pixelWidth;
				pixels[ji++] = zoomer.onUpdatePixel(zoomer, this.frame, x, y);
			}
		}
		this.frame.cntPixels = pixelWidth * pixelHeight;

		// update completion
		this.frame.complete = 1;
	};
}

/**
 *
 * When using angles:
 * The frame must be square and its size must be the diagonal of the viewing area.
 *
 * Viewing direction is the center x,y and radius. Angle is part of `Frame` rendering.
 *
 * @class
 * @param {int}		viewWidth		 	 - View width
 * @param {int}		viewHeight		 	 - View Height
 * @param {boolean}	enableAngle		 - Enable rotation
 * @param {Object}	[options]   		 - Template values for new frames. These may be changed during runtime.
 * @param {float}	[options.frameRate]	 - Frames per second
 * @param {float}	[options.turboFrameRate] - Frames per second when no navigational changes
 * @param {float}	[options.updateSlice]	 - UPDATEs get sliced into smaller chucks to stay responsive and limit overshoot
 * @param {float}	[options.coef]		 - Low-pass filter coefficient to dampen spikes
 * @param {boolean}	[options.disableWW]	 - Disable Web Workers
 * @param {function}	[options.onInitFrame]	 - Additional allocation of a new frame.
 * @param {function}	[options.onBeginFrame]	 - Called before start frame. Set x,y,radius,angle.
 * @param {function}	[options.onUpdatePixel]	 - Called to calculate pixel values.
 * @param {function}	[options.onRenderFrame]	 - Called directly before rendering. Set palette.
 * @param {function}	[options.onEndFrame]	 - Called directly after frame complete. Update statistics
 * @param {function}	[options.onPutImageData] - Inject frame into canvas.
 */
function Zoomer(viewWidth, viewHeight, enableAngle, options) {
	/*
	 * defaults. Suggested to review and adapt to your situation
	 */

	/**
	 * Frames per second.
	 * Rendering frames is expensive, too high setting might render more than calculate.
	 * If a too high setting causes a frame to drop, `zoomer` will lower this setting with 10%
	 *
	 * @member {float} - Frames per second
	 */
	this.frameRate = 20;

	/**
	 * Turbo mode is when there is no visible movement.
	 * When detected, lower FPS to (drastically) reduce render overhead.
	 * Calls to `setPosition()` disable turbo mode.
	 * There is still a coding issue with the time needed to switch back to normal mode.
	 *
	 * @member {float} - Framerate when in turbo mode
	 */
	this.turboFrameRate = 2;

	/**
	 * Duration in milli-seconds used to timeslice the `UPDATE` state.
	 * Basically the sample duration for the timer queue Phased Locked Loop.
	 * With 20FPS the frame delay is 1/20 = 50 mSec.
	 * With an `updateSlice` of 5 mSec there are 10 slices per frame.
	 * Also the acceptable maximum for overshooting a vsync.
	 *
	 * @member {float} - Timeslice duration `UPDATE` state
	 */
	this.updateSlice = 5;

	/**
	 * Low-pass coefficient to dampen spikes for continuous averages.
	 * Used primarily for the timer queue Phase Locked Loop.
	 * Formula:
	 * 	 average += (sample - average) * coef
	 *
	 * @member {float} - Low-pass filter coefficient to dampen spikes
	 */
	this.coef = 0.10;

	/**
	 * Disable web-workers.
	 * Offload frame rendering to web-workers.
	 * When ever the default changes, you will appreciate it explicitly being noted.
	 * You cannot use webworkers if you add protected recources to frames.
	 *
	 * @member {boolean} - disable/Enable web workers.
	 */
	this.disableWW = false;

	/**
	 * Additional resources added to new frames.
	 * Frames are passed to webworkers.
	 * Frames are re-used without reinitialising.
	 *
	 * Most commonly, setup optional palette,
	 *
	 * @param {Zoomer}      zoomer - Running engine
	 * @param {ZoomerFrame} frame  - Frame being initialized.
	 */
	this.onInitFrame = (zoomer, frame) => {
		// allocate RGBA palette.
		// `zoomer` does not read the contents, web-workers do

		/* frame.palette = new Uint32Array(65536); */
	};

	/**
	 * Start of a new frame.
	 * Process timed updates (piloting), set x,y,radius,angle.
	 *
	 * @param {Zoomer}      zoomer    - Running engine
	 * @param {ZoomerView}  calcView  - View about to be constructed
	 * @param {ZoomerFrame} calcFrame - Frame about to be constructed
	 * @param {ZoomerView}  dispView  - View to extract rulers
	 * @param {ZoomerFrame} dispFrame - Frame to extract pixels
	 */
	this.onBeginFrame = (zoomer, calcView, calcFrame, dispView, dispFrame) => {
		// set navigation direction

		/* zoomer.setPosition(centerX, centerY, radius, angle); */
	};

	/**
	 * This is done for every pixel. optimize well!
	 * Easy extendable for 3D.
	 * Return the pixel value for the given floating point coordinate.
	 * Zoomer will use it to fill integer pixel positions.
	 * The positions are ordered in decreasing significance.
	 *
	 * @param {Zoomer}      zoomer  - Running engine
	 * @param {ZoomerFrame} frame   - Pixel/Palette/Rotate
	 * @param {float}       x       - X coordinate
	 * @param {float}       y       - Y coordinate
	 * @return {int} - Pixel value
	 */
	this.onUpdatePixel = (zoomer, frame, x, y) => {
		// calculate pixel

		return 0; /* your code here */
	};

	/**
	 * Start extracting (rotated) RGBA values from (paletted) pixels.
	 * Extract rotated view from pixels and store them in specified imagedata.
	 * Called just before submitting the frame to a web-worker.
	 *
	 * @param {Zoomer}      zoomer - Running engine
	 * @param {ZoomerFrame} frame  - Frame about to render
	 */
	this.onRenderFrame = (zoomer, frame) => {
		// update palette

		/* updatePalette(frame.palette); */
	};

	/**
	 * Frame construction complete. Update statistics. Check resize.
	 *
	 * @param {Zoomer}      zoomer - Running engine
	 * @param {ZoomerFrame} frame  - Frame before releasing to pool
	 */
	this.onEndFrame = (zoomer, frame) => {
		// statistics

		/* console.log('fps', zoomer.avgFrameRate); */
	};

	/**
	 * Inject frame into canvas.
	 * This is a callback to keep all canvas resource handling/passing out of Zoomer context.
	 *
	 * @param {Zoomer}      zoomer - Running engine
	 * @param {ZoomerFrame} frame  - Frame to inject
	 */
	this.onPutImageData = (zoomer, frame) => {
		// get final buffer
		const imageData = new ImageData(new Uint8ClampedArray(frame.rgba.buffer), frame.viewWidth, frame.viewHeight);

		// draw frame onto canvas. `ctx` is namespace of caller.
		ctx.putImageData(imagedata, 0, 0);
	};

	/*
	 * Authoritative Visual center
	 */

	/** @member {float}
	    @description Center X coordinate */
	this.centerX = 0;

	/** @member {float}
	    @description Center Y coordinate */
	this.centerY = 0;

	/** @member {float}
	    @description Distance between center and view corner */
	this.radius = 0;

	/** @member {float}
	    @description Current view angle (degrees) */
	this.angle = 0;

	/** @member {float}
	    @description radius of horizontal view edges */
	this.radiusViewHor = 0;

	/** @member {float}
	    @description radius of vertical view edges */
	this.radiusViewVer = 0;

	/*
	 * Display/storage dimensions.
	 *
	 * @date 2020-10-22 20:13:36
	 * Sizes are lowered to next even to minimize rounding errors.
	 * Make sure the parent container has "margin: auto" to supply extra space and not scale.
	 */

	/** @member {boolean}
	    @description Enable rotation */
	this.enableAngle = enableAngle;

	/** @member {int}
	    @description Display/screen width (pixels) */
	this.viewWidth = viewWidth;

	/** @member {int}
	    @description Display/screen height (pixels) */
	this.viewHeight = viewHeight;

	/** @member {int}
	    @description Frame buffer width (pixels) */
	this.pixelWidth = !this.enableAngle ? this.viewWidth : Math.ceil(Math.sqrt(this.viewWidth * this.viewWidth + this.viewHeight * this.viewHeight));

	/** @member {int}
	    @description Frame buffer height (pixels) */
	this.pixelHeight = !this.enableAngle ? this.viewHeight : this.pixelWidth;

	/*
	 * Main state settings
	 */

	/**
	 * @member {number} state
	 * @property {number}  0 STOP
	 * @property {number}  1 COPY
	 * @property {number}  2 UPDATE
	 * @property {number}  3 RENDER
	 * @property {number}  4 PAINT
	 */
	this.state = 0;

	const STOP = 0;
	const COPY = 1; // start of new frame
	const UPDATE = 2; // update current frame
	const RENDER = 3; // render old frame
	const PAINT = 4; // paint old frame

	/** @member {int}
	    @description Current frame number*/
	this.frameNr = 0;

	/** @member {int}
	    @description Number of times mainloop called */
	this.mainloopNr = 0;

	/** @member {ZoomerView}
	    @description View #0 for even frames */
	this.view0 = new ZoomerView(this.viewWidth, this.viewHeight, this.pixelWidth, this.pixelHeight);

	/** @member {ZoomerView}
	    @description View #1 for odd frames*/
	this.view1 = new ZoomerView(this.viewWidth, this.viewHeight, this.pixelWidth, this.pixelHeight);

	/** @member {ZoomerView}
	    @description View being constructed */
	this.calcView = this.view0;

	/** @member {ZoomerFrame}
	    @description Frame being constructed */
	this.calcView = this.view0;

	/** @member {ZoomerView}
	    @description View being displayed. Frame is/might be detached. */
	this.dispView = this.view0;

	/** @member {ZoomerFrame[]}
	    @description list of free frames */
	this.frames = [];

	/** @member {Worker[]}
	    @description Web workers */
	this.WWorkers = [];

	/**
	 * @member {boolean}
	 * @property {number}  0 NORMAL
	 * @property {number}  1 PENDING
	 * @property {number}  2 TURBO
	 * @description Turbo mode active (lower framerate) */
	this.turboActive = false;

	const NORMAL = 0;
	const PENDING = 1; // will promote to turbo on next frame
	const TURBO = 2;

	/*
	 * Timestamps
	 */

	/** @member {float[]}
	    @description Start timestamps for states */
	this.stateStart = [0, 0, 0, 0, 0];

	/** @member {int}
	    @description Timestamp of last PAINT (for fps calculation) */
	this.timeLastFrame = 0;

	/** @member {int}
	    @description Timestamp of last dropped frame */
	this.timeLastDrop = 0;

	/** @member {int}
	    @description Frame number sending to workers */
	this.sendFrameNr = 0;

	/** @member {int}
	    @description Frame number receiving from workers */
	this.recvFrameNr = 0;

	/*
	 * Statistics
	 */

	/** @member {int[]}
	    @description Number of times state was handled by `mainloop` */
	this.stateTicks = [0, 0, 0, 0, 0];

	/** @member {float[]}
	    @description Average duration of states in milli seconds */
	this.avgStateDuration = [0, 0, 0, 0, 0];

	/** @member {float[]}
	    @description Average duration of states in milli seconds */
	this.avgFrameDuration = [0, 0, 0, 0, 0];

	/** @member {float[]}
	    @description Average calculated pixels per frame */
	this.avgPixelsPerFrame = 0;

	/** @member {float[]}
	    @description Average calculated lines per frame */
	this.avgLinesPerFrame = 0;

	/** @member {float[]}
	    @description Average worker round-trip time */
	this.avgRoundTrip = 0;

	/** @member {float[]}
	    @description Average real frame rate */
	this.avgFrameRate = 0;

	/** @member {float[]}
	    @description Average Completion (0..1) */
	this.avgComplete = 0;

	/** @member {float}
	    @description Total number of milli seconds UPDATE was prolonged. calculate() takes too long. */
	this.timeOvershoot = 0;

	/** @member {int}
	    @description Number of dropped frames */
	this.cntDropped = 0;

	/** @member {int}
	    @description Number of lost frames, out-of-order */
	this.cntLost = 0;

	/**
	 * Allocate a new frame, reuse if same size otherwise let it garbage collect
	 *
	 * @param {int}   viewWidth   - Screen width (pixels)
	 * @param {int}   viewHeight  - Screen height (pixels)
	 * @param {int}   pixelWidth  - Storage width (pixels)
	 * @param {int}   pixelHeight - Storage Heignt (pixels)
	 * @param {float} angle       - Angle (degrees)
	 * @return {ZoomerFrame}
	 */
	this.allocFrame = (viewWidth, viewHeight, pixelWidth, pixelHeight, angle) => {
		// find frame with matching dimensions
		for (; ;) {
			/** @var {ZoomerFrame} */
			let frame = this.frames.shift();

			// allocate new if list empty
			if (!frame)
				frame = new ZoomerFrame(viewWidth, viewHeight, pixelWidth, pixelHeight);

			// return if dimensions match
			if (frame.viewWidth === viewWidth && frame.viewHeight === viewHeight && frame.pixelWidth === pixelWidth && frame.pixelHeight === pixelHeight) {
				frame.frameNr = this.frameNr;
				frame.angle = angle;

				// clear statistics
				frame.timeStart = 0;
				frame.timeEnd = 0;
				frame.durationCOPY = 0;
				frame.durationUPDATE = 0;
				frame.durationRENDER = 0;
				frame.durationPAINT = 0;
				frame.durationRoundTrip = 0;
				frame.cntPixels = 0;
				frame.cntHLines = 0;
				frame.cntVLines = 0;

				// additional allocation
				this.onInitFrame(this, frame);

				return frame;
			}
		}
	};

	/**
	 * Update statistics with frame metrics
	 *
	 * @param {ZoomerFrame} frame
	 */
	this.updateStatistics = (frame) => {
		this.avgFrameDuration[COPY] += (frame.durationCOPY - this.avgFrameDuration[COPY]) * this.coef;
		this.avgFrameDuration[UPDATE] += (frame.durationUPDATE - this.avgFrameDuration[UPDATE]) * this.coef;
		this.avgFrameDuration[RENDER] += (frame.durationRENDER - this.avgFrameDuration[RENDER]) * this.coef;
		this.avgFrameDuration[PAINT] += (frame.durationPAINT - this.avgFrameDuration[PAINT]) * this.coef;
		this.avgPixelsPerFrame += (frame.cntPixels - this.avgPixelsPerFrame) * this.coef;
		this.avgLinesPerFrame += ((frame.cntHLines + frame.cntVLines) - this.avgLinesPerFrame) * this.coef;
		this.avgRoundTrip += (frame.durationRoundTrip - this.avgRoundTrip) * this.coef;
		this.avgComplete += ((frame.cntPixels / (frame.pixelWidth * frame.pixelHeight)) - this.avgComplete) * this.coef;

	};

	/**
	 * Set the center coordinate and radius.
	 *
	 * @param {float}    centerX       - Center x of view
	 * @param {float}    centerY       - Center y or view
	 * @param {float}    radius        - Radius of view
	 * @param {float}    [angle]       - Angle of view
	 * @param {ZoomerView} [keyView] - Previous view to inherit keyFrame rulers/pixels
	 */
	this.setPosition = (centerX, centerY, radius, angle, keyView) => {
		angle = this.enableAngle ? angle : 0;

		// exit turbo mode
		this.turboActive = NORMAL;

		this.centerX = centerX;
		this.centerY = centerY;
		this.radius = radius;
		this.angle = angle ? angle : 0;

		// Determine the radius of the borders
		// NOTE: this determines the aspect ration
		if (this.viewWidth > this.viewHeight) {
			// landscape
			this.radiusViewVer = radius;
			this.radiusViewHor = radius * this.viewWidth / this.viewHeight;
		} else {
			// portrait
			this.radiusViewHor = radius;
			this.radiusViewVer = radius * this.viewHeight / this.viewWidth;
		}

		// optionally inject keyFrame into current view
		if (keyView) {
			this.calcFrame = this.allocFrame(this.viewWidth, this.viewHeight, this.pixelWidth, this.pixelHeight, this.angle);
			this.calcView.setPosition(this.calcFrame, this.centerX, this.centerY, this.radius, keyView);
		}
	};

	/**
	 * start the state machine
	 */
	this.start = () => {
		// test if already running
		if (this.state !== STOP)
			return;

		// change state
		this.state = COPY;
		this.stateStart[this.state] = performance.now();

		// send message to start engine
		postMessage("mainloop", "*");
	};

	/**
	 * stop the state machine
	 */
	this.stop = () => {
		// test if already stopped
		if (this.state === STOP)
			return;

		// change state
		this.avgStateDuration[this.state] += ((performance.now() - this.stateStart[this.state]) - this.avgStateDuration[this.state]) * this.coef;
		this.state = STOP;
	};

	/**
	 * Resize request
	 *
	 * @param {int}     viewWidth   - Width
	 * @param {int}     viewHeight  - Height
	 * @param {boolean} enableAngle - Allow rotation
	 */
	this.resize = (viewWidth, viewHeight, enableAngle) => {
		this.enableAngle = enableAngle;

		// snap to even sizes
		this.viewWidth = viewWidth;
		this.viewHeight = viewHeight;
		this.pixelWidth = !this.enableAngle ? this.viewWidth : Math.ceil(Math.sqrt(this.viewWidth * this.viewWidth + this.viewHeight * this.viewHeight));
		this.pixelHeight = !this.enableAngle ? this.viewHeight : this.pixelWidth;

		/*
		 * dispFrame may already be on its way to the worker
		 * create a new current frame based on the (incomplete) current
		 */
		const oldCalcView = this.calcView;

		// create new views
		this.view0 = new ZoomerView(this.viewWidth, this.viewHeight, this.pixelWidth, this.pixelHeight);
		this.view1 = new ZoomerView(this.viewWidth, this.viewHeight, this.pixelWidth, this.pixelHeight);
		this.calcView = (this.frameNr & 1) ? this.view1 : this.view0;

		// copy the contents
		this.calcFrame = this.allocFrame(this.viewWidth, this.viewHeight, this.pixelWidth, this.pixelHeight, this.angle);
		this.calcView.setPosition(this.calcFrame, this.centerX, this.centerY, this.radius, oldCalcView);

		// set palette
		this.onRenderFrame(this, this.calcFrame);

		// render frame
		this.calcFrame.timeExpire = 0; // disable expiration
		zoomerRenderFrame(this.calcFrame);

		// push frame into canvas
		this.onPutImageData(this, this.calcFrame);
	};

	/**
	 * GUI mainloop called by timer event
	 *
	 * @returns {boolean}
	 */
	this.mainloop = () => {
		if (!this.state) {
			// return and don't call again
			return false;
		}
		this.mainloopNr++;

		let now = performance.now();

		// make local for speed
		const view = (this.frameNr & 1) ? this.view1 : this.view0;

		// current time
		this.stateTicks[this.state]++;

		if (this.state === COPY) {
			/*
			 * COPY. start a new frame and inherit from the previous
			 */

			/*
			 * allocate new frame
			 */
			this.frameNr++;

			this.dispView = this.calcView;
			const previousFrame = this.dispView.frame;

			const frame = this.allocFrame(this.viewWidth, this.viewHeight, this.pixelWidth, this.pixelHeight, this.angle);
			frame.timeStart = now;

			// set expiration time. Use `Date.now()` as that syncs with the workers
			previousFrame.timeExpire = Date.now() + 2 * (1000 / this.frameRate);

			// COPY (performance hit)
			this.calcFrame = frame;
			this.calcView = (this.frameNr & 1) ? this.view1 : this.view0;

			// promote to turbo when pending. can be canceled by `onBeginFrame()` calling `setPosition()`.
			if (this.turboActive === PENDING)
				this.turboActive = TURBO;

			now = performance.now();
			frame.durationCOPY = now - frame.timeStart;
			this.onBeginFrame(this, this.calcView, this.calcView.frame, this.dispView, previousFrame);

			this.calcView.setPosition(this.calcFrame, this.centerX, this.centerY, this.radius, this.dispView);

			if (!this.disableWW) {
				// RENDER `Worker` context
				this.onRenderFrame(this, previousFrame);

				now = performance.now();
				this.stateStart[RENDER] = now; // mark activation of worker

				// transfer frame to worker
				previousFrame.durationRoundTrip = now;
				previousFrame.frameNr = this.sendFrameNr++;
				if (previousFrame.palette)
					this.WWorkers[this.frameNr & 1].postMessage(previousFrame, [previousFrame.rgba.buffer, previousFrame.pixels.buffer, previousFrame.palette.buffer]);
				else
					this.WWorkers[this.frameNr & 1].postMessage(previousFrame, [previousFrame.rgba.buffer, previousFrame.pixels.buffer]);
			}

			// change state
			now = performance.now();
			this.avgStateDuration[this.state] += ((now - this.stateStart[this.state]) - this.avgStateDuration[this.state]) * this.coef;
			this.state = this.disableWW ? RENDER : UPDATE;
			this.stateStart[this.state] = now;

			// return and call again.
			postMessage("mainloop", "*");
			return true;
		}

		if (this.state === RENDER) {
			/*
			 * RENDER `Window` context.
			 * NOTE: Should be near identical to worker listen handler.
			 */

			/*
			 * @date 2020-10-15 19:17:28
			 * With `getContext("2d", {desynchronized: true}))`, `putImageData()` has been reduces to ~1mSec.
			 * To reduce overhead, don't schedule the state `PAINT` but append directly
			 */
			const frame = this.dispView.frame;

			// inform invoker
			this.onRenderFrame(this, frame);

			// render frame
			zoomerRenderFrame(frame);

			// change state
			now = performance.now();
			this.avgStateDuration[this.state] += ((now - this.stateStart[this.state]) - this.avgStateDuration[this.state]) * this.coef;
			this.state = frame.durationRENDER ? PAINT : COPY; // don't paint when throttled
			this.stateStart[this.state] = now;

			if (this.state !== PAINT) {
				// throttled
				this.cntDropped++;
				if (now - this.timeLastDrop > 2000) {
					// after 2 second adaptation, if dropped lower FPS by 5%
					this.frameRate -= this.frameRate * 0.05;
					this.timeLastDrop = now;
				}

				// return and call again.
				postMessage("mainloop", "*");
				return true;
			}

			/*
			 * perform PAINT
			 */

			const stime = now;

			this.onPutImageData(this, frame);

			now = performance.now();

			// update statistics
			frame.timeEnd = now;
			frame.durationPAINT = now - stime;
			this.updateStatistics(frame);

			// update actual framerate
			if (this.timeLastFrame)
				this.avgFrameRate += (1000 / (now - this.timeLastFrame) - this.avgFrameRate) * this.coef;
			this.timeLastFrame = now;

			// frame end-of-life
			this.onEndFrame(this, frame);

			// return frame to free pool
			this.frames.push(frame);
			this.dispView.frame = undefined; // unlink frame

			// state change
			now = performance.now();
			this.avgStateDuration[this.state] += ((now - this.stateStart[this.state]) - this.avgStateDuration[this.state]) * this.coef;
			this.state = UPDATE;
			this.stateStart[this.state] = now;

			// return and call again.
			postMessage("mainloop", "*");
			return true;
		}

		if (this.state === UPDATE) {
			/*
			 * UPDATE. calculate inaccurate pixels
			 */
			const frame = this.calcView.frame;

			// when would the next frame sync point be
			let nextsync;
			if (this.turboActive === TURBO) {
				// turbo mode
				nextsync = this.stateStart[COPY] + 1000 / this.turboFrameRate - this.avgStateDuration[COPY] - this.avgStateDuration[PAINT];
			} else {
				// normal mode
				nextsync = this.stateStart[COPY] + 1000 / this.frameRate - this.avgStateDuration[COPY] - this.avgStateDuration[PAINT];
			}
			// reduce time rendering in foreground
			if (this.disableWW)
				nextsync -= this.avgStateDuration[RENDER];

			// let it run for at least one slice
			if (nextsync < now + this.updateSlice)
				nextsync = now + this.updateSlice;

			// promote to turbo on next frame
			this.turboActive = PENDING;

			// time of next frame
			let etime = nextsync;
			// throttle to time slice
			if (etime > now + this.updateSlice)
				etime = now + this.updateSlice;

			// update inaccurate pixels
			const stime = now;
			let cntUpdated = 0;
			while (now < etime) {
				cntUpdated = view.updateLines(this);

				now = performance.now();

				// test for completion
				if (!cntUpdated)
					break;
			}

			// update stats
			frame.durationUPDATE += now - stime; // cumulative

			// end time reached?
			etime = nextsync;
			if (now >= etime || !cntUpdated) {
				if (now >= etime) {
					// register overshoot
					this.timeOvershoot += now - etime;
				}

				// change state
				this.avgStateDuration[this.state] += ((now - this.stateStart[this.state]) - this.avgStateDuration[this.state]) * this.coef;
				this.state = COPY;
				this.stateStart[this.state] = now;
			}

			if (!cntUpdated) {
				// nothing was calculate, enter sleep mode
				const delay = (this.turboActive === TURBO);
				setTimeout(() => {
					this.stateStart[this.state] = performance.now();
					postMessage("mainloop", "*");
				}, etime - now);
			} else {
				// return and call again.
				postMessage("mainloop", "*");
			}
			return true;
		}

		// shouldn't reach here
		this.stop();

		// return and don't call again
		return false;
	};

	/**
	 * Use message queue as highspeed queue handler. SetTimeout() is throttled.
	 *
	 * @param {message} event
	 */
	this.handleMessage = (event) => {
		if (event.source === window && event.data === "mainloop") {
			event.stopPropagation();
			this.mainloop();
		}
	};

	/*
	 * Conversion routines:
	 * R = rotate
	 * U = un-rotate
	 *
	 *  Pixel -U-> Screen -R-> Coord -U-> Screen -R-> Pixel
	 *  Pixel ---------------> Coord ---------------> Pixel
	 */

	/**
	 * Convert pixel I/J (int) to screen U/V (int) coordinate
	 *
	 * @param {int} pixelI
	 * @param {int} pixelJ
	 * @param {float} [angle]
	 * @return {Object} - {u,v}
	 */
	this.pixelIJtoScreenUV = (pixelI, pixelJ, angle) => {

		if (!angle) {
			// fast convert
			const u = pixelI - ((this.pixelWidth - this.viewWidth) >> 1);
			const v = pixelJ - ((this.pixelHeight - this.viewHeight) >> 1);

			return {u: u, v: v};
		} else {
			// move to center
			let i = pixelI - (this.pixelWidth / 2);
			let j = pixelJ - (this.pixelHeight / 2);

			// sin/cos for angle
			const rsin = Math.sin(angle * Math.PI / 180);
			const rcos = Math.cos(angle * Math.PI / 180);

			// undo rotation
			const _i = i;
			i = _i * rcos - j * rsin;
			j = _i * rsin + j * rcos;

			// scale and shift to screen
			const u = i + (this.viewWidth / 2);
			const v = j + (this.viewHeight / 2);

			return {u: Math.round(u), v: Math.round(v)};
		}
	};

	/**
	 * Convert pixel I/J (int) to center relative coordinate dX/dY (float)  coordinate
	 *
	 * @param {int} pixelI
	 * @param {int} pixelJ
	 * @return {Object} - {dx,dy}
	 */
	this.pixelIJtoCoordDXY = (pixelI, pixelJ) => {

		// move to center
		let i = pixelI - (this.pixelWidth >> 1);
		let j = pixelJ - (this.pixelHeight >> 1);

		// scale and shift to coord
		const dx = i * this.radiusViewHor / (this.viewWidth >> 1);
		const dy = j * this.radiusViewVer / (this.viewHeight >> 1);

		return {dx: dx, dy: dy};
	};

	/**
	 * Convert screen U/V (int) to center relative coordinate dX/dY (float)  coordinate
	 *
	 * @param {int} screenU
	 * @param {int} screenV
	 * @param {float} [angle]
	 * @return {Object} - {x,y}
	 */
	this.screenUVtoCoordDXY = (screenU, screenV, angle) => {

		// move to center
		let u = screenU - (this.viewWidth >> 1);
		let v = screenV - (this.viewHeight >> 1);

		if (angle) {
			// sin/cos for angle
			const rsin = Math.sin(angle * Math.PI / 180);
			const rcos = Math.cos(angle * Math.PI / 180);

			// apply rotation
			const _u = u;
			u = v * rsin + _u * rcos;
			v = v * rcos - _u * rsin;
		}

		// scale and shift to coord
		const dx = u * this.radiusViewHor / (this.viewWidth >> 1);
		const dy = v * this.radiusViewVer / (this.viewHeight >> 1);

		return {dx: dx, dy: dy};
	};

	/**
	 * Convert center relative coordinate dX/dY (float) to screen U/V (int) coordinate
	 *
	 * @param {float} coordDX
	 * @param {float} coordDY
	 * @param {float} [angle]
	 * @return {Object} - {u,v}
	 */
	this.coordDXYtoScreenUV = (coordDX, coordDY, angle) => {

		// move to center
		let dx = coordDX;
		let dy = coordDY;

		if (angle) {
			// sin/cos for angle
			const rsin = Math.sin(angle * Math.PI / 180);
			const rcos = Math.cos(angle * Math.PI / 180);

			/*
			 * @date 2020-10-23 02:46:46
			 * The next two instructions are intended to be performed in parallel.
			 * It ensures that the `x` in the bottom instruction is the original and not the outcome of the top.
			 */
			// undo rotation
			const _dx = dx;
			dx = _dx * rcos - dy * rsin;
			dy = _dx * rsin + dy * rcos;
		}

		// scale and shift to screen
		const u = dx * (this.viewWidth >> 1) / this.radiusViewHor + (this.viewWidth >> 1);
		const v = dy * (this.viewHeight >> 1) / this.radiusViewVer + (this.viewHeight >> 1);

		return {u: Math.round(u), v: Math.round(v)};
	};

	/**
	 * Convert center relative coordinate dX/dY (float) to pixel I/J (int) coordinate
	 *
	 * @param {float} coordDX
	 * @param {float} coordDY
	 * @return {Object} - {i,j}
	 */
	this.coordDXYtoPixelIJ = (coordDX, coordDY) => {

		// move to center
		let dx = coordDX;
		let dy = coordDY;

		// scale and shift to pixel
		const i = dx * (this.viewWidth >> 1) / this.radiusViewHor + (this.pixelWidth >> 1);
		const j = dy * (this.viewHeight >> 1) / this.radiusViewVer + (this.pixelHeight >> 1);

		return {i: Math.round(i), j: Math.round(j)};
	};

	/**
	 * Convert screen U/V (int) to pixel I/J (int) coordinate
	 *
	 * @param {int} screenU
	 * @param {int} screenV
	 * @param {float} [angle]
	 * @return {Object} - {i,j}
	 */
	this.screenUVtoPixelIJ = (screenU, screenV, angle) => {

		if (!angle) {
			// fast convert
			const i = screenU + ((this.pixelWidth - this.viewWidth) >> 1);
			const j = screenV + ((this.pixelHeight - this.viewHeight) >> 1);

			return {i: i, j: j};
		} else {
			// move to center
			let u = screenU - (this.viewWidth >> 1);
			let v = screenV - (this.viewHeight >> 1);

			if (angle) {
				// sin/cos for angle
				const rsin = Math.sin(angle * Math.PI / 180);
				const rcos = Math.cos(angle * Math.PI / 180);

				// apply rotation
				const _u = u;
				u = v * rsin + _u * rcos;
				v = v * rcos - _u * rsin;

			}

			// scale and shift to pixel
			const i = u + (this.pixelWidth >> 1);
			const j = v + (this.pixelHeight >> 1);

			return {i: Math.round(i), j: Math.round(j)};
		}
	};

	/**
	 * Global constructor
	 */
	{
		// import options
		Object.assign(this, options);


		// set initial dummy frame
		this.calcFrame = this.allocFrame(1, 1, 1, 1, 0);
		this.calcView.setPosition(this.calcFrame, 0, 0, 0, null);

		/*
		 * Message queue listener for time-slicing.
		 */
		addEventListener("message", this.handleMessage);

		/*
		 * create 2 workers
		 */

		if (!this.disableWW) {
			let dataObj = "( function () { \n";
			dataObj += zoomerMemcpy;
			dataObj += "\n";
			dataObj += zoomerRenderFrame;
			dataObj += "\n";
			dataObj += "addEventListener(\"message\", (e) => { \n";
			dataObj += "const frame = e.data;\n";
			dataObj += "zoomerRenderFrame(frame);\n";
			dataObj += "if (frame.palette)\n";
			dataObj += "  postMessage(frame, [frame.rgba.buffer, frame.pixels.buffer, frame.palette.buffer]);\n";
			dataObj += "else\n";
			dataObj += "  postMessage(frame, [frame.rgba.buffer, frame.pixels.buffer]);\n";
			dataObj += "})})()\n";

			const blob = new Blob([dataObj]);
			const blobURL = (URL ? URL : webkitURL).createObjectURL(blob);

			// create workers
			for (let i = 0; i < 2; i++) {
				this.WWorkers[i] = new Worker(blobURL);

				this.WWorkers[i].addEventListener("message", (e) => {
					/** @var {ZoomerFrame} */
					const frame = e.data;

					let now = performance.now();
					frame.durationRoundTrip = now - frame.durationRoundTrip;

					if (frame.frameNr < this.recvFrameNr) {
						// highly delayed frame, skip
						this.cntLost++;
					} else if (frame.durationRENDER === 0) {
						// throttled/dropped
						this.cntDropped++;
						if (now - this.timeLastDrop > 2000) {
							// after 2 second adaptation, if dropped lower FPS by 5%
							this.frameRate -= this.frameRate * 0.05;
							this.timeLastDrop = now;
						}
					} else {
						// update RENDER statistics (as-if state change)
						this.avgStateDuration[RENDER] += (frame.durationRENDER - this.avgStateDuration[RENDER]) * this.coef;
						this.stateStart[PAINT] = now;

						/*
						 * perform PAINT
						 */

						const stime = now;

						this.onPutImageData(this, frame);

						now = performance.now();

						// update statistics
						frame.timeEnd = now;
						frame.durationPAINT = now - stime;
						this.updateStatistics(frame);
					}

					// update frame number
					this.recvFrameNr = frame.frameNr;

					// update actual framerate
					if (this.timeLastFrame)
						this.avgFrameRate += (1000 / (now - this.timeLastFrame) - this.avgFrameRate) * this.coef;
					this.timeLastFrame = now;

					// frame end-of-life
					this.onEndFrame(this, frame);

					// return frame to free pool
					this.frames.push(frame);

					// update PAINT statistics (as-if state change)
					this.avgStateDuration[PAINT] += ((now - this.stateStart[PAINT]) - this.avgStateDuration[PAINT]) * this.coef;

				});
			}
		}
	}

}
