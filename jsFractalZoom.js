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
	Config.zoomManualSpeedMin = 1.01;
	/** @member {number} - zoom magnification slider Max */
	Config.zoomManualSpeedMax = 50.0;
	/** @member {number} - zoom magnification slider Now */
	Config.zoomManualSpeedNow = 20;

	/** @member {number} - zoom magnification slider Min */
	Config.zoomAutoSpeedMin = 1.01;
	/** @member {number} - zoom magnification slider Max */
	Config.zoomAutoSpeedMax = 4.0;
	/** @member {number} - zoom magnification slider Now */
	Config.zoomAutoSpeedNow = 2;

	/** @member {number} - rotate speed slider Min */
	Config.rotateSpeedMin = -0.4;
	/** @member {number} - rotate speed slider Max */
	Config.rotateSpeedMax = +0.4;
	/** @member {number} - rotate speed slider Now */
	Config.rotateSpeedNow = 0;

	/** @member {number} - palette cycle slider Min */
	Config.paletteSpeedMin = -30.0;
	/** @member {number} - palette cycle slider Max */
	Config.paletteSpeedMax = +30.0;
	/** @member {number} - palette cycle slider Now */
	Config.paletteSpeedNow = 0;

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
	/** @member {number} - max Iteration for calculations */
	Config.maxIter = 0;
	/** @member {number} - Auto adapting low-pass coefficient */
	Config.maxIterCoef = 0.01;
	/** @member {number} - Auto adapting AllocateAhead */
	Config.maxIterBump = 100;


	/** @member {number} - current palette offset - timer updated */
	Config.paletteOffsetFloat = 0;
	/** @member {number} - Palette size before colours start repeating */
	Config.paletteSize = 0;

	/** @member {number} - current viewport zoomSpeed - timer updated */
	Config.zoomSpeed = 0;
	/** @member {number} - After 1sec, get 80% closer to target speed */
	Config.zoomSpeedCoef = 0.80;

	Config.formula = "";
	Config.incolour = "";
	Config.outcolour = "";
	Config.plane = "";

	/** @member {float} - center X coordinate - autopilot updated */
	Config.autopilotX = 0;
	/** @member {float} - center Y coordinate - autopilot updated */
	Config.autopilotY = 0;
	/** @member {float} - Dampen sharp autopilot direction changed */
	Config.autopilotCoef = 0.3;
	/** @member {number} - HighestIter/LowestIter contrast threshold */
	Config.autopilotContrast = 5;
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
Config.linearToLog = function (min, max, lin) {

	const v = Math.exp((lin - min) / (max - min)); // 1 <= result <= E

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
Config.logTolinear = function (min, max, log) {

	const v = (log - min) * (Math.E - 1) / (max - min) + 1;

	return Math.log(v) * (max - min) + min;
};

/**
 * set initial position
 */
Config.home = function () {
	if (Formula) {
		const initial = Formula.initial[Formula.formula];

		Config.centerX = initial.x;
		Config.centerY = initial.y;
		Config.radius = initial.r;
		Config.angle = initial.a;
	}
};

/**
 * Palette creation
 *
 * NOTE: Palette is always 65536 large (16 bits pixel value)
 * NOTE: color 65535 is always background colour
 *
 * @class
 */
function Palette() {
	/** @member {Uint32Array} - palette data */
	this.palette = new Uint32Array(65536);

	/** @member {number} - background red */
	this.backgroundRed = 0;
	/** @member {number} - background green */
	this.backgroundGreen = 0;
	/** @member {number} - background blue */
	this.backgroundBlue = 0;

	/**
	 * Create a random number in range 0 <= return < n
	 *
	 * @function
	 * @param n
	 * @returns {number}
	 */
	const random = function (n) {
		return Math.floor(Math.random() * n);
	};

	this.mksmooth = function (nsegments, segmentsize, R, G, B) {
		// set palette modulo size
		Config.paletteSize = nsegments * segmentsize;

		let k = 0;
		for (let i = 0; i < nsegments; i++) {
			let r = R[i % nsegments];
			let g = G[i % nsegments];
			let b = B[i % nsegments];
			const rs = (R[(i + 1) % nsegments] - r) / segmentsize;
			const gs = (G[(i + 1) % nsegments] - g) / segmentsize;
			const bs = (B[(i + 1) % nsegments] - b) / segmentsize;

			for (let j = 0; j < segmentsize; j++) {

				this.palette[k++] = Math.floor(r) << 0 | Math.floor(g) << 8 | Math.floor(b) << 16 | 255 << 24;

				r += rs;
				g += gs;
				b += bs;
			}
		}
	};

	this.randomize_segments1 = function (whitemode, nsegments, segmentsize) {
		const R = new Array(nsegments);
		const G = new Array(nsegments);
		const B = new Array(nsegments);

		if (whitemode) {
			R[0] = 255;
			G[0] = 255;
			B[0] = 255;
			for (let i = 0; i < nsegments; i += 2) {
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
			for (let i = 0; i < nsegments; i += 2) {
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

	this.randomize_segments2 = function (whitemode, nsegments, segmentsize) {
		const R = new Array(nsegments);
		const G = new Array(nsegments);
		const B = new Array(nsegments);

		for (let i = 0; i < nsegments; i++) {
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

	this.randomize_segments3 = function (whitemode, nsegments, segmentsize) {
		let h, s, v;
		const R = new Array(nsegments);
		const G = new Array(nsegments);
		const B = new Array(nsegments);

		for (let i = 0; i < nsegments; i++) {
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
					const hue = h * 6;

					const f = hue & 255;
					const p = v * (256 - s) >> 8;
					const q = v * (256 - ((s * f) >> 8)) >> 8;
					const t = v * (256 * 256 - (s * (256 - f))) >> 16;
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

	this.randomize_segments4 = function () {

		let rcycle, gcycle, bcycle;
		do {
			rcycle = Math.random() * 128 + 8;
			gcycle = Math.random() * 128 + 8;
			bcycle = Math.random() * 128 + 8;
			Config.paletteSize = rcycle * gcycle * bcycle;
		} while (Config.paletteSize >= 65535);

		for (let i = 0; i < Config.paletteSize; i++) {
			this.palette[i] =
				Math.round(128.0 + 127 * Math.sin(Math.PI * i / rcycle)) << 0 | /* Red */
				Math.round(128.0 + 127 * Math.sin(Math.PI * i / gcycle)) << 8 | /* Green */
				Math.round(128.0 + 127 * Math.sin(Math.PI * i / bcycle)) << 16 | /* Blue */
				255 << 24; /* Alpha */
		}
	}

	this.randomize_segments5 = function (whitemode) {

		Config.paletteSize = 1000;
		for (let i = 0; i < 1000; i++) {
			const g = whitemode ? 255 - Math.round(i * 255 / 1000) : Math.round(i * 255 / 1000);
			this.palette[i] =
				g << 0 | /* Red */
				g << 8 | /* Green */
				g << 16 | /* Blue */
				255 << 24; /* Alpha */
		}
	}

	this.mkrandom = function () {
		// 85 = 255 / 3
		let segmentsize, nsegments;
		const whitemode = random(2);

		segmentsize = random(85 + 4);
		segmentsize += random(85 + 4);
		segmentsize += random(85 + 4);
		segmentsize += random(85 + 4);	/* Make smaller segments with higher probability */

		segmentsize = Math.abs(segmentsize >> 1 - 85 + 3);
		if (segmentsize < 8)
			segmentsize = 8;
		if (segmentsize > 85)
			segmentsize = 85;

		switch (random(8)) {
		case 0:
			segmentsize = Math.floor(segmentsize / 2) * 2;
			nsegments = Math.floor(256 / segmentsize);
			this.randomize_segments1(whitemode, nsegments, segmentsize);
			break;
		case 1:
			segmentsize = Math.floor(segmentsize / 3) * 3;
			nsegments = Math.floor(256 / segmentsize);
			this.randomize_segments2(whitemode, nsegments, segmentsize);
			break;
		case 2:
			segmentsize = Math.floor(segmentsize / 6) * 6;
			nsegments = Math.floor(256 / segmentsize);
			this.randomize_segments3(whitemode, nsegments, segmentsize);
			break;
		case 3:
			this.randomize_segments1(whitemode, Config.maxIter, 1);
			break;
		case 4:
			this.randomize_segments2(whitemode, Config.maxIter, 1);
			break;
		case 5:
			this.randomize_segments3(whitemode, Config.maxIter, 1);
			break;
		case 6:
			this.randomize_segments4();
			break;
		case 7:
			this.randomize_segments5(whitemode);
			break;
		}
	};

	this.mkdefault = function () {
		const gray = [0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff];
		this.mksmooth(16, 1, gray, gray, gray);
	};

	/**
	 * Set palette
	 *
	 * @param {Uint32Array} out32  - frame.palette
	 * @param {int}         offset - Starting positionfor colour rotation
	 */
	this.setPalette = function (out32, offset, maxIter) {
		const paletteSize = Config.paletteSize;

		// palette offset may not be negative
		if (offset < 0)
			offset = (paletteSize - 1) - (-offset - 1) % paletteSize;
		else
			offset = offset % paletteSize;

		// apply colour cycling
		for (let i = 0; i < maxIter; i++) {
			out32[i] = this.palette[offset++];
			if (offset >= paletteSize)
				offset -= paletteSize;
		}

		// background colour
		out32[65535] = 0x00000000; // transparent
	};

	/*
	 * Create initial palette
	 */
	this.mkdefault();
}

/**
 * DOM bindings and event handlers
 *
 * @class
 * @param {Config} config
 */
function GUI(config) {
	/** @member {Config} - Reference to config object */
	this.config = config;

	/*
	 * DOM elements and their matching id's
	 */
	this.domZoomer = "idZoomer";
	this.domStatusTitle = "idStatusTitle";
	this.domStatusPosition = "idStatusPosition";
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
	this.domFramerateLeft = "idFramerateLeft";
	this.domFramerateRail = "idFramerateRail";
	this.domFramerateThumb = "idFramerateThumb";
	this.domWxH = "WxH";
	this.domAutopilot = "idAutopilot";

	/** @member {number} - viewport mouse X coordinate */
	this.mouseU = 0;
	this.mouseX = 0;
	/** @member {number} - viewport mouse Y coordinate */
	this.mouseV = 0;
	this.mouseY = 0;
	/** @member {number} - viewport mouse button state. OR-ed set of Aria.ButtonCode */
	this.mouseButtons = 0;

	/** @member {boolean} - fractal coordinate of pointer when button first pressed */
	this.dragActive = false;
	/** @member {float} - fractal X coordinate of pointer */
	this.dragCenterX = 0;
	/** @member {float} - fractal Y coordinate of pointer */
	this.dragCenterY = 0;

	// per second differences
	this.lastNow = 0;
	this.directionalInterval = 100; // Interval timer for directional movement corrections

	/*
	 * Find the elements and replace the string names for DOM references
	 */
	for (let property in this) {
		if (this.hasOwnProperty(property) && property.substr(0, 3) === "dom") {
			this[property] = document.getElementById(this[property]);
		}
	}

	this.zoomer = new Zoomer(this.domZoomer, true, {

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
			this.domWxH.innerHTML = "[" + viewWidth + "x" + viewHeight + "]";
		},

		/**
		 * Additional allocation of a new frame.
		 * Setup optional palette and add custom settings
		 * NOTE: each frame has it's own palette.
		 *
		 * @param {Zoomer}   zoomer - This
		 * @param {Frame}    frame  - Frame being initialized.
		 */
		onInitFrame: (zoomer, frame) => {
			// create a palette buffer for palette mode
			if (palette)
				frame.palette = new Uint32Array(65536);
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
			this.zoomer.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle);

			// maxIter for embedded calc(), maxDepth for formula.js
			this.domStatusTitle.innerHTML = JSON.stringify({x: Config.centerX, y: Config.centerY, radius: Config.radius, angle: Config.angle, maxIter: Config.maxIter, quality: previousFrame.quality});
		},

		/**
		 * This is done for every pixel. optimize well!
		 *
		 * @param {Zoomer}   zoomer  - This
		 * @param {Frame}    frame   - This
		 * @param {float}    x       - X value
		 * @param {float}    y       - Y value
		 */
		onUpdatePixel: (zoomer, frame, x, y) => {
			/*
			 * @date 2020-10-24 23:21:24
			 * `Formula.calculate()` doesn't return `iter` when in/out colour active.
			 * It therefor handles adaptive maxIter just before coulouring.
			 * Disable the next code:
			 */
			// if (Config.maxIter < iter + 100 && iter !== 65535)
			// 	Config.maxIter += Math.round((iter + 100 - Config.maxIter) * 0.01); // increase maxIter with low-pass filter

			return Formula.calculate(x, y);
		},

		/**
		 * Start extracting (rotated) RGBA values from (paletted) pixels.
		 * Extract rotated viewport from pixels and store them in specified imagedata.
		 * Called just before submitting the frame to a web-worker.
		 * Previous frame is complete, current frame is under construction.
		 *
		 * @param {Zoomer} zoomer - This
		 * @param {Frame}  frame  - Previous frame
		 */
		onRenderFrame: (zoomer, frame) => {
			// inject palette into frame
			if (frame.palette)
				palette.setPalette(frame.palette, Math.round(Config.paletteOffsetFloat), Config.maxIter);
		},

		/**
		 * Frame construction complete. Update statistics.
		 *
		 * @param {Zoomer}   zoomer       - This
		 * @param {Frame}    previousFrame - Current frame
		 */
		onEndFrame: (zoomer, previousFrame) => {

			// window.gui.domStatusPosition.innerHTML = JSON.stringify(this.counters);

			const now = performance.now();

			if (now - this.lastNow >= 250) {

				// round for displaying
				for (let i = 0; i < zoomer.stateTicks.length; i++) {
					zoomer.avgStateDuration[i] = Math.round(zoomer.avgStateDuration[i]);
					zoomer.avgFrameDuration[i] = Math.round(zoomer.avgFrameDuration[i]);
				}

				this.domStatusLoad.innerHTML = JSON.stringify({
					ticks: zoomer.stateTicks,
					state: zoomer.avgStateDuration,
					frame: zoomer.avgFrameDuration,
					ppf: Math.round(zoomer.avgPixelsPerFrame),
					lpf: Math.round(zoomer.avgLinesPerFrame),
					rt: Math.round(zoomer.avgRoundTrip),
					fps: Math.round(zoomer.avgFrameRate)
				});

				this.lastNow = now;
			}
		},

		/**
		 * Inject frame into canvas.
		 * This is a callback to keep all canvas resource handling/passing out of Zoomer context.
		 *
		 * @param {Zoomer}   zoomer - This
		 * @param {Frame}    frame  - Frame to inject
		 */
		onPutImageData: (zoomer, frame) => {

			const imagedata = new ImageData(new Uint8ClampedArray(frame.rgba.buffer), frame.viewWidth, frame.viewHeight);

			// draw frame onto canvas
			this.ctx.putImageData(imagedata, 0, 0);
		}
	});

	/*
	 * @date 2020-10-15 13:08:13
	 * `desynchronized` dramatically speed enhances `putImageData()` but it might also glitch mouse movement when hovering over the canvas.
	 * `alpha` might have an effect, however not noticed yet.
	 */

	/** @member {CanvasRenderingContext2D} */
	this.ctx = this.domZoomer.getContext("2d", {desynchronized: true});

	// Create a small key frame (mandatory)
	const keyViewport = new Viewport(64, 64, 64, 64); // Explicitly square

	// Calculate all the pixels, or choose any other content (optional)
	keyViewport.fill(Config.centerX, Config.centerY, Config.radius, Config.angle, this.zoomer, this.zoomer.onUpdatePixel);

	// set initial position and inject key frame (mandatory)
	this.zoomer.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle, keyViewport)

	// replace event handlers with a bound instance
	this.handleMouse = this.handleMouse.bind(this);
	this.handleFocus = this.handleFocus.bind(this);
	this.handleBlur = this.handleBlur.bind(this);
	this.handleKeyDown = this.handleKeyDown.bind(this);
	this.handleKeyUp = this.handleKeyUp.bind(this);

	// register global key bindings before widgets overrides
	this.domZoomer.addEventListener("focus", this.handleFocus);
	this.domZoomer.addEventListener("blur", this.handleBlur);
	this.domZoomer.addEventListener("mousedown", this.handleMouse);
	this.domZoomer.addEventListener("contextmenu", this.handleMouse);
	document.addEventListener("keydown", this.handleKeyDown);
	document.addEventListener("keyup", this.handleKeyUp);

	// construct sliders
	this.speed = new Aria.Slider(this.domZoomSpeedThumb, this.domZoomSpeedRail,
		Config.zoomManualSpeedMin, Config.zoomManualSpeedMax, Config.linearToLog(Config.zoomManualSpeedMin, Config.zoomManualSpeedMax, Config.zoomManualSpeedNow));
	this.rotateSpeed = new Aria.Slider(this.domRotateThumb, this.domRotateRail,
		Config.rotateSpeedMin, Config.rotateSpeedMax, Config.rotateSpeedNow);
	this.paletteSpeed = new Aria.Slider(this.domPaletteSpeedThumb, this.domPaletteSpeedRail,
		Config.paletteSpeedMin, Config.paletteSpeedMax, Config.paletteSpeedNow);
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

	// sliders
	this.speed.setCallbackValueChange((newValue) => {
		if (Config.autoPilot) {
			// scale exponentially
			newValue = Config.logTolinear(Config.zoomAutoSpeedMin, Config.zoomAutoSpeedMax, newValue);
			Config.zoomAutoSpeedNow = newValue;
			this.domZoomSpeedLeft.innerHTML = newValue.toFixed(2);
		} else {
			// scale exponentially
			newValue = Config.logTolinear(Config.zoomManualSpeedMin, Config.zoomManualSpeedMax, newValue);
			Config.zoomManualSpeedNow = newValue;
			this.domZoomSpeedLeft.innerHTML = newValue.toFixed(2);
		}
	});
	this.rotateSpeed.setCallbackValueChange((newValue) => {
		if (newValue > -0.01 && newValue < +0.01)
			newValue = 0; // snap to center
		Config.rotateSpeedNow = newValue;
		this.domRotateLeft.innerHTML = newValue.toFixed(2);
	});
	this.paletteSpeed.setCallbackValueChange((newValue) => {
		if (newValue > -1 && newValue < +1)
			newValue = 0; // snap to center
		Config.paletteSpeedNow = newValue;
		this.domPaletteSpeedLeft.innerHTML = newValue.toFixed(0);
	});
	this.Framerate.setCallbackValueChange((newValue) => {
		newValue = Math.round(newValue);
		Config.framerateNow = newValue;
		this.domFramerateLeft.innerHTML = newValue;

		this.zoomer.frameRate = Config.framerateNow;
	});

	// listboxes
	this.formula.listbox.setCallbackFocusChange((focusedItem) => {
		Config.formula = focusedItem.id;
		this.domFormulaButton.innerText = focusedItem.innerText;
		const formula = focusedItem.id.substr(8) | 0;
		Formula.formula = formula;
		Config.home();
		this.reload();
	});
	this.incolour.listbox.setCallbackFocusChange((focusedItem) => {
		Config.incolour = focusedItem.id;
		this.domIncolourButton.innerText = focusedItem.innerText;
		const incolour = focusedItem.id.substr(9) | 0;
		Formula.incolour = incolour;
		this.reload();
	});
	this.outcolour.listbox.setCallbackFocusChange((focusedItem) => {
		Config.outcolour = focusedItem.id;
		this.domOutcolourButton.innerText = focusedItem.innerText;
		const outcolour = focusedItem.id.substr(10) | 0;
		Formula.outcolour = outcolour;
		this.reload();
	});
	this.plane.listbox.setCallbackFocusChange((focusedItem) => {
		Config.plane = focusedItem.id;
		this.domPlaneButton.innerText = focusedItem.innerText;
		const plane = focusedItem.id.substr(6) | 0;
		Formula.plane = plane;
		Config.home();
		this.reload();
	});

	// buttons
	this.power.setCallbackValueChange((newValue) => {
		if (newValue)
			this.zoomer.start(); // power on
		else
			this.zoomer.stop(); // power off
	});
	this.autoPilot.setCallbackValueChange((newValue) => {
		/*
		 * When switching auto/manual mode and view is still moving, the change in speed is visually noticable.
		 * Adapt the speed such that the magnification is continuous
		 *
		 * `magnify = Math.pow(Config.zoomSpeedNow, Config.zoomSpeed * diffSec)`
		 */
		const magnify = Math.pow(Config.autoPilot ? Config.zoomAutoSpeedNow : Config.zoomManualSpeedNow, Config.zoomSpeed)

		Config.autoPilot = newValue;

		// switch slider values
		if (newValue) {
			this.speed.valueMin = Config.zoomAutoSpeedMin;
			this.speed.valueMax = Config.zoomAutoSpeedMax;
			this.speed.valueNow = Config.linearToLog(Config.zoomAutoSpeedMin, Config.zoomAutoSpeedMax, Config.zoomAutoSpeedNow);
			Config.zoomSpeed = Math.log(magnify) / Math.log(Config.zoomAutoSpeedNow);
			this.autopilotOn();
		} else {
			this.speed.valueMin = Config.zoomManualSpeedMin;
			this.speed.valueMax = Config.zoomManualSpeedMax;
			this.speed.valueNow = Config.linearToLog(Config.zoomManualSpeedMin, Config.zoomManualSpeedMax, Config.zoomManualSpeedNow);
			Config.zoomSpeed = Math.log(magnify) / Math.log(Config.zoomManualSpeedNow);
			this.autopilotOff();
		}

		this.speed.moveSliderTo(this.speed.valueNow);
		this.speed.updateLabels();
	});
	this.home.setCallbackValueChange((newValue) => {
		Config.autopilotX = 0;
		Config.autopilotY = 0;
		Config.home();
		this.reload();
	});

	this.paletteGroup.setCallbackFocusChange((newButton) => {
		if (newButton.domButton.id === "idRandomPaletteButton") {
			window.palette.mkrandom();
		} else {
			window.palette.mkdefault();
		}

		/*
		 * @date 2020-10-15 13:02:00
		 * call `setPosition` to force a new frame to avoid colour glitching.
		 * This shouldn't happen because of event queue isolation.
		 * However, this handler is UI event context and `renderFrame()` is `postMessage()` context.
		 */
		this.zoomer.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle);
	});

	setInterval((e) => {
		// seconds since last cycle
		const now = performance.now();
		const diffSec = this.directionalInterval / 1000;
		const currentViewport = this.zoomer.currentViewport;

		if (Config.autoPilot) {
			if (currentViewport.reachedLimits()) {
				Config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_RIGHT;
				window.gui.domAutopilot.style.border = '4px solid orange';
			} else {
				this.domStatusPosition.innerHTML = "";

				if (!this.updateAutopilot(currentViewport, 4, 16))
					if (!this.updateAutopilot(currentViewport, 60, 16))
						if (!this.updateAutopilot(currentViewport, Math.min(currentViewport.pixelWidth, currentViewport.pixelHeight) >> 1, 16))
							Config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_RIGHT;
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
			const dispViewport = this.zoomer.previousViewport;
			const {dx, dy} = dispViewport.screenUVtoCoordDXY(this.mouseU, this.mouseV, Config.angle);

			if (!this.dragActive) {
				// save the fractal coordinate of the mouse position. that stays constant during the drag gesture
				this.dragCenterX = dispViewport.centerX + dx;
				this.dragCenterY = dispViewport.centerY + dy;
				this.dragActive = true;
			}

			// update x/y but keep radius
			Config.centerX = this.dragCenterX - dx;
			Config.centerY = this.dragCenterY - dy;
		} else {
			this.dragActive = false;
		}

		// zoom-in/out gesture
		if (Config.zoomSpeed) {
			// convert normalised zoom speed (-1<=speed<=+1) to magnification and scale to this time interval
			const speedNow = Config.autoPilot ? Config.zoomAutoSpeedNow : Config.zoomManualSpeedNow;
			const magnify = Math.pow(speedNow, Config.zoomSpeed * diffSec);

			// zoom, The mouse pointer coordinate should not change
			Config.centerX = (Config.centerX - this.mouseX) / magnify + this.mouseX;
			Config.centerY = (Config.centerY - this.mouseY) / magnify + this.mouseY;
			Config.radius = Config.radius / magnify;
		}

		// if anything is changing/moving, disable idling
		// NOTE: expect for zoomspeed which is handled by the mouseHandler
		if (Config.autoPilot || this.mouseButtons || Config.rotateSpeedNow || Config.paletteSpeedNow)
			this.zoomer.timeLastWake = 0;

	}, this.directionalInterval);
}

/**
 * Handle keyboard down event
 *
 * @param {KeyboardEvent} event
 */
GUI.prototype.handleKeyDown = function (event) {
	const key = event.which || event.keyCode;

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
			this.domZoomer.focus();
		break;
	case 0x49: // I
	case 0x69: // i
		if (!this.incolour.toggleListbox(event))
			this.domZoomer.focus();
		break;
	case 0x4f: // O
	case 0x6f: // o
		if (!this.outcolour.toggleListbox(event))
			this.domZoomer.focus();
		break;
	case 0x50: // P
	case 0x70: // p
		if (!this.plane.toggleListbox(event))
			this.domZoomer.focus();
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
	const key = event.which || event.keyCode;

	// Grab the keydown and click events
	switch (key) {
	case 0x41: // A
	case 0x61: // a
		this.autoPilot.buttonUp();
		this.domZoomer.focus();
		break;
	case 0x44: // D
	case 0x64: // d
		this.paletteGroup.radioButtons[1].buttonUp();
		this.domZoomer.focus();
		break;
	case 0x51: // Q
	case 0x71: // q
		this.power.buttonUp();
		this.domZoomer.focus();
		break;
	case 0x52: // R
	case 0x62: // r
		this.paletteGroup.radioButtons[0].buttonUp();
		this.domZoomer.focus();
		break;
	case Aria.KeyCode.HOME:
		this.home.buttonUp();
		this.domZoomer.focus();
		break;
	case Aria.KeyCode.UP:
		this.domZoomer.focus();
		break;
	case Aria.KeyCode.DOWN:
		this.domZoomer.focus();
		break;
	case Aria.KeyCode.PAGE_DOWN:
		this.domZoomer.focus();
		break;
	case Aria.KeyCode.PAGE_UP:
		this.domZoomer.focus();
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
	this.domZoomer.classList.add("focus");
};

/**
 * Handle blur event
 *
 * @param {FocusEvent} event
 */
GUI.prototype.handleBlur = function (event) {
	this.domZoomer.classList.remove("focus");
};

/**
 * Shared handler for all mouse events
 *
 * @param {MouseEvent} event
 */
GUI.prototype.handleMouse = function (event) {

	const rect = this.domZoomer.getBoundingClientRect();

	/*
	 * On first button press set a document listener to catch releases outside target element
	 */
	if (this.mouseButtons === 0 && event.buttons !== 0) {
		// on first button press set release listeners
		document.addEventListener("mousemove", this.handleMouse);
		document.addEventListener("mouseup", this.handleMouse);
		document.addEventListener("contextmenu", this.handleMouse);
	}

	this.mouseU = event.pageX - rect.left;
	this.mouseV = event.pageY - rect.top;

	/*
	 * @date 2020-10-26 12:42:18
	 * Use the viewport angle as that is what you see when clicking. `Config.angle` lags behind.
	 */
	const viewport = (this.zoomer.frameNr & 1) ? this.zoomer.viewport1 : this.zoomer.viewport0;
	let {dx, dy} = viewport.screenUVtoCoordDXY(this.mouseU, this.mouseV, Config.angle);

	this.mouseX = Config.centerX + dx;
	this.mouseY = Config.centerY + dy;

	/*
	 * Encountered a Hydra bug.
	 * Keeping test cases here in case its head pops up again
	 */
	if (0) {

		let u1 = this.mouseU;
		let v1 = this.mouseV;

		const {i: i2, j: j2} = viewport.screenUVtoPixelIJ(u1, v1, Config.angle);

		// visually verify pixel is correct
		frame.palette[65534] = 0xff0000ff;
		frame.pixels[j2*frame.pixelWidth+i2] = 65534;

		const {u: u3, v: v3} = viewport.pixelIJtoScreenUV(i2, j2, Config.angle);
		console.log('a', u3-u1, v3-v1);

		let {dx: x4, dy: y4} = viewport.screenUVtoCoordDXY(u3, v3, Config.angle);
		x4 += Config.centerX;
		y4 += Config.centerY;

		let {i: i5, j: j5} = viewport.coordDXYtoPixelIJ(x4-Config.centerX, y4-Config.centerY);
		console.log('b', i5-i2, j5-j2);

		// visually verify pixel is correct
		frame.palette[65533] = 0xff00ff00;
		frame.pixels[j5*frame.pixelWidth+i5] = 65533;

		let {dx: x6, dy: y6} = viewport.pixelIJtoCoordDXY(i5, j5);
		x6 += Config.centerX;
		y6 += Config.centerY;
		console.log('c', x6 - x4, y6 - y4);

		let {u : u7, v : v7} = viewport.coordDXYtoScreenUV(x6-Config.centerX,  y6-Config.centerY, Config.angle);
		console.log('d', u7-u3, v7-v3);
		console.log('e', u7-u1, v7-v1);

	}

	this.mouseButtons = event.buttons;

	if (event.buttons === 0) {
		// remove listeners when last button released
		document.removeEventListener("mousemove", this.handleMouse);
		document.removeEventListener("mouseup", this.handleMouse);
		document.removeEventListener("contextmenu", this.handleMouse);
	}

	/*
	 * @date 2020-10-16 19:36:53
	 * Pressing mouse buttons is a gesture to wake.
	 * `setPosition()` wakes from idle state.
	 * Setting x,y,radius,angle happens withing the `onBeginFrame()` callback.
	 * Don't wait and wake immediately
	 */
	if (!event.buttons && !Config.autoPilot && !Config.rotateSpeedNow && !Config.paletteSpeedNow)
		this.zoomer.timeLastWake = performance.now(); // safe to idle
	else
		this.zoomer.timeLastWake = 0; // something is moving, don't idle

	event.preventDefault();
	event.stopPropagation();
};

/**
 * (re)load initial frame
 */
GUI.prototype.reload = function () {
	// reset maxiter
	Config.maxIter = 300;

	// Create a small key frame (mandatory)
	const keyViewport = new Viewport(64, 64, 64, 64); // Explicitly square

	// set all pixels of thumbnail with latest set `calculate`
	keyViewport.fill(Config.centerX, Config.centerY, Config.radius, Config.angle, this.zoomer, this.zoomer.onUpdatePixel);

	// if nothing moving, enable idling
	if (!Config.zoomSpeed && !this.mouseButtons && !Config.autoPilot && !Config.rotateSpeedNow && !Config.paletteSpeedNow)
		this.zoomer.timeLastWake = performance.now(); // safe to idle

	// inject into current viewport
	this.zoomer.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle, keyViewport);
};

/**
 * @param {number} lookPixelRadius
 * @param {number} borderPixelRadius
 * @returns {boolean}
 */
GUI.prototype.updateAutopilot = function (viewport, lookPixelRadius, borderPixelRadius) {

	const {pixelWidth, pixelHeight, viewWidth, viewHeight, pixels} = viewport;

	// use '>>1' as integer '/2'

	// Get viewport bounding box
	let minI = (pixelWidth - viewWidth) >> 1;
	let maxI = pixelWidth - minI;
	let minJ = (pixelHeight - viewHeight) >> 1;
	let maxJ = pixelHeight - minJ;

	// subtract border
	minI += borderPixelRadius;
	maxI -= borderPixelRadius;
	minJ += borderPixelRadius;
	maxJ -= borderPixelRadius;

	// `cnt`
	const minCnt = ((borderPixelRadius + 1) * (borderPixelRadius + 1)) >> 2;
	const maxCnt = minCnt * 3;

	// coordinate within pixel data pointed to by mouse
	let {i: apI, j: apJ} = viewport.coordDXYtoPixelIJ(Config.autopilotX - viewport.centerX, Config.autopilotY - viewport.centerY);

	/*
	 * @date 2020-10-24 23:59:53
	 * Old code only focused to in/out set horizons.
	 * Add moving to areas of high contrast.
	 */

	/** @var {Frame}
	    @description Bounding box center location */
	let bestI= 0;

	/** @var {Frame}
	    @description Bounding box center location */
	let bestJ = 0;

	/** @var {Frame}
	    @description Bounding box contains the highest `iter` */
	let bestIterHigh = 0; // highest iter found within bounding box

	/** @var {Frame}
	    @description Overall lowest iter found. Start with corner pixel */
	let iterLow = 1 + Math.min(pixels[0], pixels[pixelWidth - 1], pixels[(pixelHeight - 1) * pixelWidth], pixels[pixelHeight * pixelWidth - 1]);

	// outside center rectangle, adjust autopilot heading
	for (let k = 0; k < 450; k++) {
		// head to a nearby location
		const testI = apI + Math.floor(Math.random() * (2 * lookPixelRadius)) - lookPixelRadius;
		const testJ = apJ + Math.floor(Math.random() * (2 * lookPixelRadius)) - lookPixelRadius;

		// must be visable
		if (testI < minI || testJ < minJ || testI >= maxI || testJ >= maxJ)
			continue;

		let cnt = 0;
		for (let j = testJ - borderPixelRadius; j <= testJ + borderPixelRadius; j++) {
			for (let i = testI - borderPixelRadius; i <= testI + borderPixelRadius; i++) {
				const iter = pixels[j * pixelWidth + i]
				if (iter === 65535) {
					cnt++;
				} else if (iterLow > iter) {
					iterLow = iter;
				} else if (bestIterHigh < iter) {
					bestI = testI;
					bestJ = testJ;
					bestIterHigh = iter;
				}
			}
		}

		// go for horizon first
		if (cnt >= minCnt && cnt <= maxCnt) {
			let {dx, dy} = viewport.pixelIJtoCoordDXY(testI, testJ);

			// dampen sharp autopilot direction changes
			Config.autopilotX += (Config.centerX + dx - Config.autopilotX) * Config.autopilotCoef;
			Config.autopilotY += (Config.centerY + dy - Config.autopilotY) * Config.autopilotCoef;

			Config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_LEFT;

			// get screen location
			let {u, v} = viewport.pixelIJtoScreenUV(testI, testJ, Config.angle);

			// and position autopilot mark
			window.gui.domAutopilot.style.top = (v - borderPixelRadius) + "px";
			window.gui.domAutopilot.style.left = (u - borderPixelRadius) + "px";
			window.gui.domAutopilot.style.width = (borderPixelRadius * 2) + "px";
			window.gui.domAutopilot.style.height = (borderPixelRadius * 2) + "px";
			window.gui.domAutopilot.style.border = '4px solid green';
			return true;
		}
	}

	// go for high contrast
	// Something "hangs ". This needs extra working on.
	if (0 && bestIterHigh > iterLow * Config.autopilotContrast) {
		let {dx, dy} = viewport.pixelIJtoCoordDXY(bestI, bestJ);

		// dampen sharp autopilot direction changes
		Config.autopilotX += (Config.centerX + dx - Config.autopilotX) * Config.autopilotCoef;
		Config.autopilotY += (Config.centerY + dy - Config.autopilotY) * Config.autopilotCoef;

		Config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_LEFT;

		// get screen location
		let {u, v} = viewport.pixelIJtoScreenUV(bestI, bestJ, Config.angle);

		// and position autopilot mark
		window.gui.domAutopilot.style.top = (v - borderPixelRadius) + "px";
		window.gui.domAutopilot.style.left = (u - borderPixelRadius) + "px";
		window.gui.domAutopilot.style.width = (borderPixelRadius * 2) + "px";
		window.gui.domAutopilot.style.height = (borderPixelRadius * 2) + "px";
		window.gui.domAutopilot.style.border = '4px solid green';
		return true;
	}

	Config.autopilotButtons = 0;
	window.gui.domAutopilot.style.border = '4px solid red';
	return false;
};

GUI.prototype.autopilotOn = function () {

	const viewport = this.zoomer.currentViewport;
	Config.autopilotX = Config.centerX;
	Config.autopilotY = Config.centerY;

	const diameter = Math.min(viewport.pixelWidth, viewport.pixelHeight);
	let lookPixelRadius = Math.min(16, diameter >> 1);
	const borderPixelRadius = Math.min(16, diameter >> 5);
	do {
		if (!this.updateAutopilot(viewport, lookPixelRadius, borderPixelRadius))
			break;
		lookPixelRadius >>= 1;
	} while (lookPixelRadius > 2);
};

GUI.prototype.autopilotOff = function () {
	this.mouseButtons = 0;
	this.domAutopilot.style.border = 'none';

};
