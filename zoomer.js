/*
 *  This file is part of jsFractalZoom, Fractal zoomer written in javascript
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
 * Frame, used to transport data between workers
 *
 * NOTE: data only, do not include functions to minimize transport overhead
 *
 * @class Frame
 * @param {int}   viewWidth   - Screen width (pixels)
 * @param {int}   viewHeight  - Screen height (pixels)
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

	/** @member {ArrayBuffer} - (UINT8x4) RGBA for canvas */
	this.rgbaBuffer = new ArrayBuffer(viewWidth * viewHeight * 4);

	/** @member {ArrayBuffer} - (UINT16) pixels */
	this.pixelBuffer = new ArrayBuffer(this.diameter * this.diameter * 2);

	/** @member {ArrayBuffer} - (UINT8x4) red */
	this.paletteBuffer = new ArrayBuffer(65536 * 4);
}

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
		var rgba = new Uint32Array(request.rgbaBuffer);
		var pixels = new Uint16Array(request.pixelBuffer);
		var palette32 = new Uint32Array(request.paletteBuffer);

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
		this.postMessage(request, [request.rgbaBuffer, request.pixelBuffer, request.paletteBuffer]);
	}
}

/**
 * Viewport to the fractal world.
 * The actual pixel area is square and the viewport is a smaller rectangle that can rotate fully within
 *
 * Coordinate system is the center x,y and radius.
 *
 * @class Viewport
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
	this.makeRuler = (start, end, newCoord, newNearest, newError, newFrom, oldNearest, oldError) => {

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
	this.setPosition = (x, y, radius, angle, oldViewport) => {

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
		var j = 0, i = 0, k = 0, ji = 0;
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
			if (xFrom[i - 1] === xFrom[i] && this.xError[i - 1] > this.xError[i])
				xFrom[i - 1] = -1;
			if (yFrom[i - 1] === yFrom[i] && this.yError[i - 1] > this.yError[i])
				yFrom[i - 1] = -1;
		}
		for (i = newDiameter - 2; i >= 0; i--) {
			if (xFrom[i + 1] === xFrom[i] && this.xError[i + 1] > this.xError[i])
				xFrom[i + 1] = -1;
			if (yFrom[i + 1] === yFrom[i] && this.yError[i + 1] > this.yError[i])
				yFrom[i + 1] = -1;
		}
	};

	/**
	 * Test if rulers have reached resolution limits
	 *
	 * @returns {boolean}
	 */
	this.reachedLimits = () => {
		var ij;

		/*
		 * @date 2020-10-12 18:30:14
		 * NOTE: First duplicate ruler coordinate is sufficient to mark endpoint.
		 *       This to prevent zooming full screen into a single pixel
		 */
		for (ij = 1; ij < this.diameter; ij++) {
			if (this.xCoord[ij - 1] === this.xCoord[ij] || this.yCoord[ij - 1] === this.yCoord[ij])
				return true;

		}
		return false;
	};

	/**
	 * Extract rotated viewport from pixels and store them in specified imnagedata
	 * The pixel data is palette based, the imagedata is RGB
	 *
	 * @param {ArrayBuffer} rgbaBuffer
	 * @param {ArrayBuffer} pixelBuffer
	 * @param {ArrayBuffer} paletteBuffer
	 */
	this.draw = (rgbaBuffer, pixelBuffer, paletteBuffer) => {

		// make references local
		var rgba = new Uint32Array(rgbaBuffer); // canvas pixel data
		var pixels = new Uint16Array(pixelBuffer); // pixel data
		var palette32 = new Uint32Array(paletteBuffer);

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
	 * Simple background renderer
	 */
	this.renderLines = () => {
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

			for (u = i + 1; u < diameter; u++) {
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

			for (v = j + 1; v < diameter; v++) {
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

	/**
	 *
	 */
	this.fill = () => {

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
}

/**
 *
 * @class Zoomer
 * @param {HTMLCanvasElement}	[options.domZoomer]	- Element to detect a resize	 -
 * @param {Object}		[options]   		- Template values for new frames. These may be changed during runtime.
 * @param {Element} 		[options.domZoomer]	- Element to detect a resize	 -
 * @param {float}		[options.frameRate]	- Frames per second
 * @param {float}		[options.updateSlice]	- UPDATEs get sliced into smaller  chucks to stay responsive and limit overshoot
 * @param {float}		[options.coef]		- Low-pass filter coefficient to dampen spikes
 * @param {boolean}		[options.disableWW]	- Disable Web Workers (default=false)
 * @param {function}		[options.onResize]	- Called when canvas resize detected.
 * @param {function}		[options.onKeyFrame]	- Create first/key frame.
 * @param {function}		[options.onBeginFrame]	- Called before start frame. Set x,y,radius,angle.
 * @param {function}		[options.onRenderFrame]	- Called directly before rendering. Set palette.
 * @param {function}		[options.onEndFrame]	- Called directly after frame complete. Update statistics
 * @param {function}		[options.onPutImageData] - Inject frame into canvas.
 */
function Zoomer(domZoomer, options = {

	/**
	 * DOM element to check for resizes
	 *
	 * @member {Element} - DOM element to check for resizes
	 */
	domZoomer: null,

	/**
	 * Frames per second.
	 * Rendering frames is expensive, too high setting might render more than calculate.
	 *
	 * @member {float} - Frames per second
	 */
	frameRate: 20,

	/**
	 * Update rate in milli seconds used to slice UPDATE state.
	 * Low values keep the event queue responsive.
	 *
	 * @member {float} - Frames per second
	 */
	updateSlice: 2,

	/**
	 * Low-pass coefficient to dampen spikes for averages
	 *
	 * @member {float} - Low-pass filter coefficient to dampen spikes
	 */
	coef: 0.05,

	/**
	 * Disable web-workers.
	 * Offload frame rendering to web-workers
	 *
	 * @member {boolean} - Frames per second
	 */
	disableWW: false,

	/**
	 * Size change detected for `domZoomer`
	 *
	 * @param {Zoomer} zoomer      - This
	 * @param {int}    viewWidth   - Screen width (pixels)
	 * @param {int}    viewHeight  - Screen height (pixels)
	 * @param {int}    pixelWidth  - Storage width (pixels)
	 * @param {int}    pixelHeight - Storage Heignt (pixels)
	 */
	onResize: (zoomer, viewWidth, viewHeight, pixelWidth, pixelHeight) => {
	},

	/**
	 * Create a keyframe.
	 * Every frame requires a previous frame to inherit rulers/pixels.
	 * The only exception are keyframes, who need all pixels rendered.
	 * However, they can be any size and will be scaled accordingly.
	 * `Zoomer` requires a preloaded key frame before calling `start()`.
	 *
	 * @param {Zoomer}   zoomer            - This
	 * @param {Viewport} currentViewport   - Current viewport
	 * @param {Frame}    currentFrame      - Current frame
	 */
	onKeyFrame: (zoomer, currentViewport, currentFrame) => {
	},

	/**
	 * Start of a new frame.
	 * Process timed updates (piloting), set x,y,radius,angle.
	 *
	 * @param {Zoomer}   zoomer            - This
	 * @param {Viewport} currentViewport   - Current viewport
	 * @param {Frame}    currentFrame      - Current frame
	 * @param {Viewport} previousViewport  - Previous viewport to extract rulers/pixels
	 * @param {Frame}    previousFrame     - Previous frame
	 */
	onBeginFrame: (zoomer, currentViewport, currentFrame, previousViewport, previousFrame) => {
	},

	/**
	 * Start extracting (rotated) RGBA values from (paletted) pixels.
	 * Extract rotated viewport from pixels and store them in specified imnagedata.
	 * Called just before submitting the frame to a web-worker.
	 * Previous frame is complete, current frame is under construction.
	 *
	 * @param {Zoomer}   zoomer        - This
	 * @param {Frame}    previousFrame - Previous frame
	 */
	onRenderFrame: (zoomer, previousFrame) => {
	},

	/**
	 * Frame construction complete. Update statistics.
	 * Frame might be in transit to the web-worker and is not available as parameter.
	 *
	 * @param {Zoomer}   zoomer       - This
	 * @param {Frame}    currentFrame - Current frame
	 */
	onEndFrame: (zoomer, currentFrame) => {
	},

	/**
	 * Inject frame into canvas.
	 * This is a callback to keep all canvas resource handling/passing out of Zoomer context.
	 *
	 * @param {Zoomer}   zoomer - This
	 * @param {Frame}    frame  - Frame to inject
	 */
	onPutImageData: (zoomer, frame) => {

		const rgba = new Uint8ClampedArray(frame.rgbaBuffer);
		const imagedata = new ImageData(rgba, frame.viewWidth, frame.viewHeight);

		// draw frame onto canvas
		this.ctx.putImageData(imagedata, 0, 0);
	}

}) {
	this.onResize = options.onResize;
	this.onKeyFrame = options.onKeyFrame;
	this.onBeginFrame = options.onBeginFrame;
	this.onRenderFrame = options.onRenderFrame;
	this.onEndFrame = options.onEndFrame;
	this.onPutImageData = options.onPutImageData;

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

	this.viewport0 = new Viewport(domZoomer.clientWidth, domZoomer.clientHeight);
	this.viewport1 = new Viewport(domZoomer.clientWidth, domZoomer.clientHeight);
	this.currentViewport = this.viewport0;

	// per second differences
	this.counters = [0, 0, 0, 0, 0, 0, 0];
	this.rafTime = 0;

	// list of web workers
	this.wworkers = [];

	/**
	 * start the mainloop
	 */
	this.start = () => {
		this.state = 1;
		this.vsync = performance.now() + (1000 / Config.framerateNow); // vsync wakeup time
		this.statStateCopy = this.statStateUpdate = this.statStatePaint1 = this.statStatePaint2 = 0;
		window.postMessage("mainloop", "*");
	};

	/**
	 * stop the mainloop
	 */
	this.stop = () => {
		this.state = 0;
	};

	/**
	 * GUI mainloop called by timer event
	 *
	 * @returns {boolean}
	 */
	this.mainloop = () => {
		if (!this.state) {
			console.log("STOP");
			return false;
		}
		this.mainloopNr++;

		// make local for speed
		var config = this.config;
		var viewport = (this.frameNr & 1) ? this.viewport1 : this.viewport0;


		// current time
		var last;
		var now = performance.now();

		if (this.vsync === 0 || now > this.vsync + 2000) {
			// Missed vsync by more than 2 seconds, resync
			this.vsync = now + (1000 / Config.framerateNow);
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

		/*
		 * test for DOM resize
		 */
		if (domZoomer.clientWidth !== domZoomer.width || domZoomer.clientHeight !== domZoomer.height) {
			// set property
			domZoomer.width = domZoomer.clientWidth;
			domZoomer.height = domZoomer.clientHeight;

			const oldViewport0 = this.viewport0;
			const oldViewport1 = this.viewport1;

			// create new viewports
			this.viewport0 = new Viewport(domZoomer.clientWidth, domZoomer.clientHeight);
			this.viewport1 = new Viewport(domZoomer.clientWidth, domZoomer.clientHeight);

			// copy the contents
			if (this.frameNr & 1) {
				this.viewport1.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle, oldViewport1);
				this.currentViewport = this.viewport1;
			} else {
				this.viewport0.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle, oldViewport0);
				this.currentViewport = this.viewport0;
			}

			// TODO: 5 arguments
			if (this.onResize) this.onResize(this, this.currentViewport.viewWidth, this.currentViewport.viewHeight);
		}


		var oldViewport = this.currentViewport;
		this.oldFrame = oldViewport.frame;

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

		if (this.onBeginFrame) this.onBeginFrame(this, this.currentViewport, this.currentViewport.frame, oldViewport, this.oldFrame);

		/*
		 * Create palette
		 */
		this.oldFrame.now = performance.now();

		if (this.onRenderFrame) this.onRenderFrame(this, this.oldFrame);

		/*
		 * The message queue is overloaded, so call direct until improved design
		 */
		if (1) {
			oldViewport.draw(this.oldFrame.rgbaBuffer, this.oldFrame.pixelBuffer, this.oldFrame.paletteBuffer);
			Viewport.raf.push(this.oldFrame);
			window.requestAnimationFrame(this.animationFrame);
			this.statStatePaint1 += ((performance.now() - this.oldFrame.now) - this.statStatePaint1) * this.coef;
			this.statStatePaint2 += ((this.oldFrame.msec) - this.statStatePaint2) * this.coef;
		} else {
			this.wworkers[this.frameNr & 3].postMessage(this.oldFrame, [this.oldFrame.rgbaBuffer, this.oldFrame.pixelBuffer, this.oldFrame.paletteBuffer]);
		}

		/*
		 * update stats
		 */
		now = performance.now();
		this.statStateCopy += ((now - last) - this.statStateCopy) * this.coef;

		if (this.onEndFrame) this.onEndFrame(this);

		this.state = 2;
		window.postMessage("mainloop", "*");
		return true;
	};


	/**
	 * Synchronise screen updates
	 *
	 * @param {number} time
	 */
	this.animationFrame = (time) => {
		// paint image onto canvas

		// move request to pending requestAnimationFrames()
		while (Viewport.raf.length) {

			var request = Viewport.raf.shift();

			if (this.onPutImageData) this.onPutImageData(this, request);

			// move request to free list
			Viewport.frames.push(request);
		}

		this.statStateRAF += ((performance.now() - this.rafTime) - this.statStateRAF) * this.coef;
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
	 * create 4 workers
	 */
	{
		var dataObj = '(' + workerPaint + ')();'; // here is the trick to convert the above function to string
		var blob = new Blob([dataObj]);
		var blobURL = (window.URL ? URL : webkitURL).createObjectURL(blob);

		// create 4 workers
		for (var i = 0; i < 4; i++) {
			this.wworkers[i] = new Worker(blobURL);

			this.wworkers[i].onmessage = (e) => {
				/** @var {Frame} */
				var response = e.data;

				// move request to pending requestAnimationFrames()
				Viewport.raf.push(response);
				// request animation
				window.requestAnimationFrame(this.animationFrame);

				// keep track of round trip time
				this.statStatePaint1 += ((performance.now() - response.now) - this.statStatePaint1) * this.coef;
				this.statStatePaint2 += ((response.msec) - this.statStatePaint2) * this.coef;
			};
		}
	}
}
