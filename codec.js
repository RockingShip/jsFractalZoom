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
 * zoomerMemcpy over 2 arrays.
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
	    @description number of vertical lines across the X axis */
	this.cntXLines = 0;

	/** @member {int}
	    @description number of horizontal lines across the Y axis */
	this.cntYLines = 0;

	/** @member {float}
	    @description Quality */
	this.quality = 0;
}

/**
 * Viewport to the fractal world.
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

	/** @member {float}
	    @description radius of horiontal view edges */
	this.radiusViewHor = 0;

	/** @member {float}
	    @description radius of vertical view edges */
	this.radiusViewVer = 0;

	/** @member {float}
	    @description radius of horiontal pixel edges */
	this.radiusPixelHor = 0;

	/** @member {float}
	    @description radius of vertical pixel edges */
	this.radiusPixelVer = 0;

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
	this.xError = new Float64Array(this.pixelWidth);

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
	this.yError = new Float64Array(this.pixelHeight);

	/** @member {Int32Array}
	    @description Inherited index from previous update */
	this.yFrom = new Int32Array(this.pixelHeight);

	/**
	 *
	 * @param {number}       start      - start coordinate
	 * @param {number}       end        - end coordinate
	 * @param {Float64Array} newCoord   - coordinate stops
	 * @param {Float64Array} newNearest - nearest evaluated coordinate stop
	 * @param {Float64Array} newError   - difference between newCoord[] and newNearest[]
	 * @param {Uint16Array}  newFrom    - matching oldNearest[] index
	 * @param {Float64Array} oldNearest - source ruler
	 * @param {Float64Array} oldError   - source ruler
	 */
	this.makeRuler = (start, end, newCoord, newNearest, newError, newFrom, oldNearest, oldError) => {

		/*
		 *
		 */
		let cntExact = 0;

		let iOld, iNew;
		for (iOld = 0, iNew = 0; iNew < newCoord.length && iOld < oldNearest.length; iNew++) {

			// determine coordinate current tab stop
			const currCoord = (end - start) * iNew / (newCoord.length - 1) + start;

			// determine errors
			let currError = Math.abs(currCoord - oldNearest[iOld]);
			let nextError = Math.abs(currCoord - oldNearest[iOld + 1]);

			// bump if next source stop is better
			while (nextError <= currError && iOld < oldNearest.length - 1) {
				iOld++;
				currError = nextError;
				nextError = Math.abs(currCoord - oldNearest[iOld + 1]);
			}

			if (currError === 0)
				cntExact++;

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

		const {xCoord, xNearest, xError, xFrom, yCoord, yNearest, yError, yFrom, viewWidth, viewHeight, pixelWidth, pixelHeight, pixels} = this;

		this.centerX = centerX;
		this.centerY = centerY;
		this.radius = radius;

		// Determine the radius of the borders
		// NOTE: this determines the aspect ration
		if (this.viewWidth > this.viewHeight) {
			// landscape
			this.radiusViewVer = radius;
			this.radiusViewHor = radius * viewWidth / viewHeight;
			this.radiusPixelVer = radius * pixelHeight / viewHeight;
			this.radiusPixelHor = radius * pixelWidth / viewHeight;
		} else {
			// portrait
			this.radiusViewHor = radius;
			this.radiusViewVer = radius * viewHeight / viewWidth;
			this.radiusPixelHor = radius * pixelWidth / viewWidth;
			this.radiusPixelVer = radius * pixelHeight / viewWidth;
		}

		const pixelMinX = centerX - this.radiusPixelHor;
		const pixelMaxX = centerX + this.radiusPixelHor;
		const pixelMinY = centerY - this.radiusPixelVer;
		const pixelMaxY = centerY + this.radiusPixelVer;

		if (!previousView) {
			// simple linear fill of rulers
			for (let i = 0; i < xCoord.length; i++) {
				xNearest[i] = xCoord[i] = i * (pixelMaxX - pixelMinX) / xCoord.length + pixelMinX;
				xError[i] = 0;
				xFrom[i] = -1;
			}
			for (let j = 0; j < yCoord.length; j++) {
				yNearest[i] = yCoord[i] = i * (pixelMaxY - pixelMinY) / yCoord.length + pixelMinY;
				yError[j] = 0;
				yFrom[j] = -1;
			}

			return;
		}

		const {xNearest: oldXnearest, xError: oldXerror, yNearest: oldYnearest, yNearest: oldYerror, pixelWidth: oldPixelWidth, pixelHeight: oldPixelHeight, pixels: oldPixels} = previousView;

		// setup new rulers
		const exactX = this.makeRuler(centerX - this.radiusPixelHor, centerX + this.radiusPixelHor, xCoord, xNearest, xError, xFrom, previousView.xNearest, previousView.xError);
		const exactY = this.makeRuler(centerY - this.radiusPixelVer, centerY + this.radiusPixelVer, yCoord, yNearest, yError, yFrom, previousView.yNearest, previousView.yError);

		frame.cntPixels += exactX * exactY;
		frame.cntXLines += exactX;
		frame.cntYLines += exactY;

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

		// keep the `From`s with lowest error
		for (let i = 1; i < pixelWidth; i++) {
			if (xFrom[i - 1] === xFrom[i] && xError[i - 1] > xError[i])
				xFrom[i - 1] = -1;
		}
		for (let j = 1; j < pixelHeight; j++) {
			if (yFrom[j - 1] === yFrom[j] && yError[j - 1] > yError[j])
				yFrom[j - 1] = -1;
		}
		for (let i = pixelWidth - 2; i >= 0; i--) {
			if (xFrom[i + 1] === xFrom[i] && xError[i + 1] > xError[i])
				xFrom[i + 1] = -1;
		}
		for (let j = pixelHeight - 2; j >= 0; j--) {
			if (yFrom[j + 1] === yFrom[j] && yError[j + 1] > yError[j])
				yFrom[j + 1] = -1;
		}

		// update quality
		frame.quality = frame.cntPixels / (frame.pixelWidth * frame.pixelHeight);
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

	this.numPixels = 0;

	/**
	 * Simple background renderer
	 *
	 * @param {Zoomer}            zoomer        - caller context
	 * @param {Uint8ClampedArray} dstPixels     - Pixel buffer with actual image
	 * @param {Uint8ClampedArray} srcPixels     - Pixel buffer with original (target) image
	 * @param {Uint8Array}        data          - Encoded frame
	 * @param {int}               dataPos       - Position/length of encoded frame
	 * @param {int}               radius        - Spash radius
	 * @param {boolean}           encodeDecode  - true=encode, false=decode
	 * @returns {number}
	 */
	this.updateLines = (zoomer, dstPixels, srcPixels, data, dataPos, radius, encodeDecode) => {

		const {xError, yError, pixels, pixelWidth, pixelHeight} = this;

		// which tabstops have the worst error
		let worstXerr = xError[0];
		let worstXi = 0;
		let worstYerr = yError[0];
		let worstYj = 0;

		for (let i = 1; i < pixelWidth; i++) {
			if (xError[i] > worstXerr) {
				worstXi = i;
				worstXerr = xError[i];
			}
		}
		for (let j = 1; j < pixelHeight; j++) {
			if (yError[j] > worstYerr) {
				worstYj = j;
				worstYerr = yError[j];
			}
		}

		if (worstXerr + worstYerr === 0)
			return 0; // nothing to do

		// console.log(worstXerr, worstYerr, worstXi, worstYj);

		/**
		 **!
		 **! The following loop is a severe performance hit
		 **!
		 **/

		let totalError = 0;

		if (worstXerr > worstYerr) {
			const i = worstXi;
			const maxError = xError[i];

			// console.log("X", i, worstXerr, worstYerr);

			/*
			 * range of splash
			 */
			let minI = i, maxI = i;
			for (let r = 1; r < radius; r++) {
				if (minI === 0 || xError[minI - 1] === 0)
					break;
				--minI;
			}
			for (let r = 1; r < radius; r++) {
				if (maxI >= pixelWidth || xError[maxI + 1] === 0)
					break;
				++maxI;
			}

			// console.log(JSON.stringify({
			// 	minI: minI, i: i, maxI: maxI
			// }))

			/*
			 * Apply changes to the ruler so X and Y are now balanced
			 */
			for (let ii = minI; ii <= maxI; ii++) {
				const alpha = Math.abs(ii - i) / radius;

				xError[ii] = Math.round(xError[ii] * alpha);
				if (i !== ii && xError[ii] === 0) {
					console.log("xError[" + ii + "] may not become zero\n");
					xError[ii] = 1;
				}
			}
			xError[i] = 0;

			/*
			 * Scan line for cross points
			 */
			for (let j = 0; j < pixelHeight; j++) {
				// only calculate cross points of exact lines, fill the others
				if (yError[j] === 0) {

					/*
					 * Read pixel
					 */
					let srcR, srcG, srcB;
					if (encodeDecode) {
						// encode

						// get pixel
						let k = (j * pixelWidth + i) * 4;
						srcR = srcPixels[k++];
						srcG = srcPixels[k++];
						srcB = srcPixels[k++];

						// output pixel
						data[dataPos++] = srcR;
						data[dataPos++] = srcG;
						data[dataPos++] = srcB;
						this.numPixels++;
					} else {
						//decode
						srcR = data[dataPos++];
						srcG = data[dataPos++];
						srcB = data[dataPos++];
					}

					// bounding box
					let minJ = j, maxJ = j;
					for (let r = 1; r < radius; r++) {
						if (minJ === 0 || yError[minJ - 1] === 0)
							break;
						--minJ;
					}
					for (let r = 1; r < radius; r++) {
						if (maxJ >= pixelHeight || yError[maxJ + 1] === 0)
							break;
						++maxJ;
					}

					// console.log(JSON.stringify({
					// 	minJ: minJ, j: j, maxJ: maxJ
					// }))

					/*
					 * Weighted flood-fill cross point
					 */
					for (let jj = minJ; jj <= maxJ; jj++) {
						for (let ii = minI; ii <= maxI; ii++) {
							const fillAlpha = 1 - Math.sqrt((ii - i) * (ii - i) + (jj - j) * (jj - j)) / radius;

							// console.log(JSON.stringify({
							// 	i:ii - i, j:jj-j,
							// 	alpha:alpha,
							// }))

							if (fillAlpha > 0) {
								// get pixel alpha
								// the more accurate the pixel (lower error) the lower the effect of the fill
								// normally neighbouring pixels have neighbouring errors
								// this should avoid filling delicate pixels like lines and letters
								const xerr = xError[ii] / maxError;
								const yerr = yError[jj] / maxError;
								const xyerr = (xerr + yerr) / 2;

								const alpha = 256 - Math.round(256 * xyerr);

								const k = (jj * width + ii) * 4;
								const oldR = dstPixels[k + 0];
								const oldG = dstPixels[k + 1];
								const oldB = dstPixels[k + 2];

								const newR = ((srcR * alpha) + (oldR * (256 - alpha))) >> 8;
								const newG = ((srcG * alpha) + (oldG * (256 - alpha))) >> 8;
								const newB = ((srcB * alpha) + (oldB * (256 - alpha))) >> 8;

								totalError -= Math.abs(srcR - oldR);
								totalError -= Math.abs(srcG - oldG);
								totalError -= Math.abs(srcB - oldB);
								totalError += Math.abs(srcR - newR);
								totalError += Math.abs(srcG - newG);
								totalError += Math.abs(srcB - newB);

								// console.log(JSON.stringify({
								// 	i:ii - i, j:jj-j,
								// 	alpha:alpha,
								// 	old:[oldR,oldG,oldB],
								// 	src:[srcR,srcG,srcB],
								// 	new:[newR,newG,newB],
								// }))

								// save new pixel value
								dstPixels[k + 0] = newR;
								dstPixels[k + 1] = newG;
								dstPixels[k + 2] = newB;
								dstPixels[k + 3] = 255;
							}
						}
					}
				}
			}
		} else {
			let j = worstYj;
			const maxError = yError[j];

			// console.log("Y", j, worstXerr, worstYerr);

			/*
			 * range of splash
			 */
			let minJ = j, maxJ = j;
			for (let r = 1; r < radius; r++) {
				if (minJ === 0 || yError[minJ - 1] === 0)
					break;
				--minJ;
			}
			for (let r = 1; r < radius; r++) {
				if (maxJ >= pixelHeight || yError[maxJ + 1] === 0)
					break;
				++maxJ;
			}

			// console.log(JSON.stringify({
			// 	minJ: minJ, j: j, maxJ: maxJ
			// }))

			/*
			 * Apply changes to the ruler so X and Y are now balanced
			 */
			for (let jj = minJ; jj <= maxJ; jj++) {
				const alpha = Math.abs(jj - j) / radius;

				yError[jj] = Math.round(yError[jj] * alpha);
				if (j !== jj && yError[jj] === 0) {
					console.log("yError[" + jj + "] may not become zero\n");
					yError[jj] = 1;
				}
			}
			yError[j] = 0;

			/*
			 * Scan line for cross points
			 */
			for (let i = 0; i < pixelWidth; i++) {
				// only calculate cross points of exact lines, fill the others
				if (xError[i] === 0) {

					/*
					 * Read pixel
					 */
					let srcR, srcG, srcB;
					if (encodeDecode) {
						// encode

						// get pixel
						let k = (j * pixelWidth + i) * 4;
						srcR = srcPixels[k++];
						srcG = srcPixels[k++];
						srcB = srcPixels[k++];

						// output pixel
						data[dataPos++] = srcR;
						data[dataPos++] = srcG;
						data[dataPos++] = srcB;
						this.numPixels++;
					} else {
						//decode
						srcR = data[dataPos++];
						srcG = data[dataPos++];
						srcB = data[dataPos++];
					}

					// bounding box
					let minI = i, maxI = i;
					for (let r = 1; r < radius; r++) {
						if (minI === 0 || xError[minI - 1] === 0)
							break;
						--minI;
					}
					for (let r = 1; r < radius; r++) {
						if (maxI >= pixelWidth || xError[maxI + 1] === 0)
							break;
						++maxI;
					}
					// console.log(JSON.stringify({
					// 	minI: minI, i: i, maxI: maxI
					// }))

					/*
					 * Weighted flood-fill cross point
					 */
					for (let ii = minI; ii <= maxI; ii++) {
						for (let jj = minJ; jj <= maxJ; jj++) {
							const fillAlpha = 1 - Math.sqrt((ii - i) * (ii - i) + (jj - j) * (jj - j)) / radius;

							// console.log(JSON.stringify({
							// 	i:ii - i, j:jj-j,
							// 	alpha:alpha,
							// }))

							if (fillAlpha > 0) {
								// get pixel alpha
								// the more accurate the pixel (lower error) the lower the effect of the fill
								// normally neighbouring pixels have neighbouring errors
								// this should avoid filling delicate pixels like lines and letters
								const xerr = xError[ii] / maxError;
								const yerr = yError[jj] / maxError;
								const xyerr = (xerr + yerr) / 2;

								const alpha = 256 - Math.round(256 * xyerr);

								const k = (jj * width + ii) * 4;
								const oldR = dstPixels[k + 0];
								const oldG = dstPixels[k + 1];
								const oldB = dstPixels[k + 2];

								const newR = ((srcR * alpha) + (oldR * (256 - alpha))) >> 8;
								const newG = ((srcG * alpha) + (oldG * (256 - alpha))) >> 8;
								const newB = ((srcB * alpha) + (oldB * (256 - alpha))) >> 8;

								totalError -= Math.abs(srcR - oldR);
								totalError -= Math.abs(srcG - oldG);
								totalError -= Math.abs(srcB - oldB);
								totalError += Math.abs(srcR - newR);
								totalError += Math.abs(srcG - newG);
								totalError += Math.abs(srcB - newB);

								// console.log(JSON.stringify({
								// 	i:ii - i, j:jj-j,
								// 	alpha:alpha,
								// 	old:[oldR,oldG,oldB],
								// 	src:[srcR,srcG,srcB],
								// 	new:[newR,newG,newB],
								// }))

								// save new pixel value
								dstPixels[k + 0] = newR;
								dstPixels[k + 1] = newG;
								dstPixels[k + 2] = newB;
								dstPixels[k + 3] = 255;
							}
						}
					}
				}
			}
		}

		return dataPos;
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

		// update quality
		this.frame.quality = 1;
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
}

//---------

let infile1 = process.argv[2];
let infile2 = process.argv[3];
let outpath = process.argv[4];
if (!outpath) {
	console.log("usage: "+process.argv[2]+" <frame1> <frame2> <outpath>");
	process.exit();
}

let { createCanvas, ImageData } = require("canvas");
let fs = require('fs');
let { PNG, COLORTYPE_COLOR_ALPHA, COLORTYPE_COLOR} = require("pngjs");

let width = 1920;
let height = 1080;

// create the canvas
let canvas = createCanvas(width, height)
canvas.width = width;
canvas.height = height;
let ctx = canvas.getContext("2d")

/*
 * create view containing encoder
 */
let view = new ZoomerView(width, height, width, height);

/*
 * Load first frame
 */
let frame1 = new ZoomerFrame(width, height, width, height);
{
	// load png
	let data = fs.readFileSync(infile1);
	let readPNG = PNG.sync.read(data);
	let pngPixels = new Uint32Array(readPNG.data.buffer);

	for (let j = 0; j < frame1.pixelHeight; j++)
		for (let i = 0; i < frame1.pixelWidth; i++)
			frame1.pixels[j * frame1.pixelWidth + i] = pngPixels[j * readPNG.width + i]; // 0xff7f7f7f; //
}

/*
 * Load next progressive frame
 */
let frame2 = new ZoomerFrame(width, height, width, height);
{
	// load png
	let data = fs.readFileSync(infile2);
	let readPNG = PNG.sync.read(data);
	let pngPixels = new Uint32Array(readPNG.data.buffer);

	for (let j = 0; j < frame2.pixelHeight; j++)
		for (let i = 0; i < frame2.pixelWidth; i++)
			frame2.pixels[j * frame2.pixelWidth + i] = pngPixels[j * readPNG.width + i];
}

/*
 * Setup starting situation
 */

let radius = 5;

let dstPixels = new Uint8ClampedArray(frame1.pixels.buffer);
let srcPixels = new Uint8ClampedArray(frame2.pixels.buffer);

let dataPos = 0;
let dataSize = (width + height + width * height) * 3;
let data = new Uint8Array(dataSize);

/*
 * save starting image
 */

const initialPixels = frame1.pixels.buffer.slice();

/*
 * encode
 */
if (1) {
	for (let i = 0; i < width; i++) {
		let err = 0;
		for (let j = 0; j < height; j++) {
			const k = (j * width + i) * 4;

			err += Math.abs(dstPixels[k + 0] - srcPixels[k + 0]);
			err += Math.abs(dstPixels[k + 1] - srcPixels[k + 1]);
			err += Math.abs(dstPixels[k + 2] - srcPixels[k + 2]);
		}

		view.xError[i] = err;

		data[dataPos++] = err >> 16;
		data[dataPos++] = err >> 8;
		data[dataPos++] = err;
	}

	for (let j = 0; j < height; j++) {
		let err = 0;
		for (let i = 0; i < width; i++) {
			let k = (j * width + i) * 4;

			err += Math.abs(dstPixels[k + 0] - srcPixels[k + 0]);
			err += Math.abs(dstPixels[k + 1] - srcPixels[k + 1]);
			err += Math.abs(dstPixels[k + 2] - srcPixels[k + 2]);
		}

		view.yError[j] = err;

		data[dataPos++] = err >> 16;
		data[dataPos++] = err >> 8;
		data[dataPos++] = err;
	}

	// pixels to encode
	const maxPixels = width * height;

	// start encoding
	view.numPixels = 0;
	do {
		const newDataPos = view.updateLines(null, dstPixels, srcPixels, data, dataPos, radius, true);
		if (!newDataPos) {
			console.log("shortFrame", view.numPixels, maxPixels);
			break; // short frame
		}
		dataPos = newDataPos;
	} while (view.numPixels < maxPixels);
}

/*
 * Reload starting image
 */

frame1.pixels = new Uint8Array(initialPixels);
dstPixels = new Uint8ClampedArray(frame1.pixels.buffer);
dataSize = dataPos;
dataPos = 0;

/*
 * Decode
 */
if (1) {
	for (let i = 0; i < width; i++) {
		let err = data[dataPos++] << 16;
		err |= data[dataPos++] << 8;
		err |= data[dataPos++];

		view.xError[i] = err;
	}

	for (let j = 0; j < height; j++) {
		let err = data[dataPos++] << 16;
		err |= data[dataPos++] << 8;
		err |= data[dataPos++];

		view.yError[j] = err;
	}

	// start encoding
	for (let frameNr = 0; ; frameNr++) {
console.log((dataPos/3-width-height)/ (width*height), Math.trunc((frameNr/25) / 60), Math.trunc(frameNr/25) % 60, frameNr%25);
		const newDataPos = view.updateLines(null, dstPixels, srcPixels, data, dataPos, radius, false);
		if (!newDataPos)
			break; // short frame

		// save frame
		{
			// put final buffer in canvas
			let idata = new ImageData(width, height);
			let dstPixels = new Uint32Array(idata.data.buffer);
			let srcPixels = new Uint32Array(frame1.pixels.buffer);

			// contents
			for (let j = 0; j < height; j++)
				for (let i = 0; i < width; i++)
					dstPixels[j * width + i] = srcPixels[j * width + i];

			// set borders
			for (let j = 0; j < height; j++) {
				let col = (view.yError[j]) ? 0xff000000 : 0xffffffff;

				for (let i = 0; i < 10; i++) {
					dstPixels[j * width + i] = col;
					dstPixels[j * width + width - 1 - i] = col;
				}
			}

			for (let i = 0; i < width; i++) {
				let col = (view.xError[i]) ? 0xff000000 : 0xffffffff;

				for (let j = 0; j < 10; j++) {
					dstPixels[j  * width + i] = col;
					dstPixels[(height - 1 - j) * width + i] = col;
				}
			}

			// inject into canvas
			ctx.putImageData(idata, 0, 0);

			// overlay/add text
			ctx.beginPath();
			ctx.strokeStyle = "#fff";
			ctx.fillStyle = "#fff";
			ctx.font = "1em fixed";
			ctx.fillText(((dataPos / 3 - width - height) / (width * height)).toString().substring(0, 8), 20, height - 20);

			// write
			let buffer = canvas.toBuffer("image/png")
			fs.writeFileSync(outpath.replace("%d", frameNr), buffer);
		}

		dataPos = newDataPos;
	}
}

/*
 * Output frame
 */
if (0) {
	// save frame
	let writePNG = new PNG({width: width, height: height});
	let pngPixels = new Uint32Array(writePNG.data.buffer);
	let pixels = new Uint32Array(frame1.pixels.buffer);

	for (let j = 0; j < height; j++)
		for (let i = 0; i < width; i++)
			pngPixels[j * width + i] = pixels[j * width + i];

	fs.writeFileSync('out.png', PNG.sync.write(writePNG));
}
