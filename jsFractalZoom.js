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
	Config.zoomSpeedMin = 1.0;
	/** @member {number} - zoom magnification slider Max */
	Config.zoomSpeedMax = 300.0;
	/** @member {number} - zoom magnification slider Now */
	Config.zoomSpeedNow = Config.logTolinear(Config.zoomSpeedMin, Config.zoomSpeedMax, 100);

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
	Config.depthMax = 4000;
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
Config.linearToLog = function (min, max, now) {

	const v = Math.exp((now - min) / (max - min)); // 1 <= result <= E

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
Config.logTolinear = function (min, max, now) {

	const v = 1 + (now - min) * (Math.E - 1) / (max - min);

	return min + Math.log(v) * (max - min);
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
		Config.rsin = Math.sin(Config.angle * Math.PI / 180);
		Config.rcos = Math.cos(Config.angle * Math.PI / 180);

	}
};

/**
 * Palette creation
 *
 * NOTE: Palette is always 65536 large (16 bits pixel value)
 * NOTE: color 65535 is always background colour
 *
 * @class Palette
 */
function Palette()
{
	/** @member {ArrayBuffer} - palette data */
	this.paletteBuffer = new ArrayBuffer(65536 * 4);

	/** @member {number} - background red */
	this.backgroundRed = 0;
	/** @member {number} - background green */
	this.backgroundGreen = 0;
	/** @member {number} - background blue */
	this.backgroundBlue = 0;

	/** @var {Uint32Array} - RGBA view of palette */
	const palette32 = new Uint32Array(this.paletteBuffer);
	/** @var {Uint8Array} - R,G,B view of palette */
	const palette8 = new Uint8Array(this.paletteBuffer);

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

	this.randomize_segments2 = function(whitemode, nsegments, segmentsize)
	{
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
					const  hue = h * 6;

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

	this.mkrandom = function() {
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

		switch (random(6)) {
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

	this.mkdefault = function () {
		const gray = [0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff];
		this.mksmooth(16, 1, gray, gray, gray);
	};

	/**
	 * Set paletteBuffer
	 *
	 * @param {ArrayBuffer} paletteBuffer
	 * @param {number} offset
	 */
	this.setPaletteBuffer = function (paletteBuffer, offset) {
		const  paletteSize = Config.paletteSize;
		const out32 = new Uint32Array(paletteBuffer);

		// palette offset may not be negative
		if (offset < 0)
			offset = (paletteSize - 1) - (-offset - 1) % paletteSize;
		else
			offset = offset % paletteSize;

		// apply colour cycling
		for (let i = 0; i < Config.depthNow; i++) {
			out32[i] = palette32[(offset + i) % paletteSize];
		}

		// background colour
		let i = 65535 * 4;
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
 * DOM bindings and event handlers
 *
 * @class GUI
 * @param config {Config}
 */
function GUI(config) {
	/** @member {Config} - Reference to config object */
	this.config = config;

	/*
	 * DOM elements and their matching id's
	 */
	this.domZoomer = "idZoomer";
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
	this.lastTick = 0;

	/*
	 * Find the elements and replace the string names for DOM references
	 */
	for (let property in this) {
		if (this.hasOwnProperty(property) && property.substr(0, 3) === "dom") {
			this[property] = document.getElementById(this[property]);
		}
	}

	this.zoomer = new Zoomer(this.domZoomer, {

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
		 * Create a keyframe.
		 * Every frame requires a previous frame to inherit rulers/pixels.
		 * The only exception are keyframes, who need all pixels rendered.
		 * However, they can be any size and will be scaled accordingly.
		 * `Zoomer` requires a preloaded key frame before calling `start()`.
		 *
		 * @param {Zoomer}   zoomer            - This
		 * @param {Viewport} currentViewport   - Current viewport
		 * @param {Frame}    currentFrame      - Current frame
		 * @param {Viewport} previousViewport  - Previous viewport to extract rulers/pixels
		 * @param {Frame}    previousFrame     - Previous frame
		 */
		onKeyFrame: (zoomer, currentViewport, currentFrame, previousViewport, previousFrame) => {
			// set all pixels of thumbnail
			this.viewportInit.fill();

			// inject into current viewport
			zoomer.currentViewport.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle, this.viewportInit);

			this.lastTick = performance.now();
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
			// seconds since last cycle
			const now = performance.now();
			const diffSec = (now - this.lastTick) / 1000;
			this.lastTick = now;

			if (Config.autoPilot) {
				if (zoomer.frameNr & 1) {
					if (zoomer.viewport1.reachedLimits()) {
						Config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_RIGHT;
						window.gui.domAutopilot.style.border = '4px solid orange';
					} else {
						this.domStatusQuality.innerHTML = "";
						if (!this.updateAutopilot(zoomer.viewport1, 4, 16))
							if (!this.updateAutopilot(zoomer.viewport1, 60, 16))
								if (!this.updateAutopilot(zoomer.viewport1, zoomer.viewport1.diameter >> 1, 16))
									Config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_RIGHT;
					}
				} else {
					if (zoomer.viewport0.reachedLimits()) {
						Config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_RIGHT;
						window.gui.domAutopilot.style.border = '4px solid orange';
					} else {
						this.domStatusQuality.innerHTML = "";
						if (!this.updateAutopilot(zoomer.viewport0, 4, 16))
							if (!this.updateAutopilot(zoomer.viewport0, 60, 16))
								if (!this.updateAutopilot(zoomer.viewport0, zoomer.viewport0.diameter >> 1, 16))
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
				const dx = this.mouseI * viewport.radiusX * 2 / viewport.viewWidth - viewport.radiusX;
				const dy = this.mouseJ * viewport.radiusY * 2 / viewport.viewHeight - viewport.radiusY;
				// undo rotation
				const x = dy * Config.rsin + dx * Config.rcos + Config.centerX;
				const y = dy * Config.rcos - dx * Config.rsin + Config.centerY;

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
				const magnify = Math.pow(Config.zoomSpeedNow, Config.zoomSpeed * diffSec);

				// zoom, The mouse pointer coordinate should not change
				Config.centerX = (Config.centerX - this.mouseX) / magnify + this.mouseX;
				Config.centerY = (Config.centerY - this.mouseY) / magnify + this.mouseY;
				Config.radius = Config.radius / magnify;
			}

			this.domStatusQuality.innerHTML = JSON.stringify({lines: Viewport.doneX + Viewport.doneY, calc: Viewport.doneCalc, x: Config.centerX, y: Config.centerY, r: Config.radius});
			Viewport.doneX = 0;
			Viewport.doneY = 0;
			Viewport.doneCalc = 0;
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
			// inject palette into frame
			palette.setPaletteBuffer(previousFrame.paletteBuffer, Math.round(Config.paletteOffsetFloat));
		},

		/**
		 * Frame construction complete. Update statistics.
		 *
		 * @param {Zoomer}   zoomer       - This
		 * @param {Frame}    currentFrame - Current frame
		 */
		onEndFrame: (zoomer, currentFrame) => {

			// window.gui.domStatusQuality.innerHTML = JSON.stringify(this.counters);

			const now = performance.now();

			this.domStatusRect.innerHTML =
				"zoom:" + zoomer.statStateCopy.toFixed(3) +
				"mSec(" + (zoomer.statStateCopy * 100 / (1000 / Config.framerateNow)).toFixed(0) +
				"%), update:" + zoomer.statStateUpdate.toFixed(3) +
				"mSec, paint:" + zoomer.statStatePaint1.toFixed(3) +
				"mSec(" + (zoomer.statStatePaint1 * 100 / (1000 / Config.framerateNow)).toFixed(0) +
				"%)+" + zoomer.statStatePaint2.toFixed(3) + ", rAF:" + zoomer.statStateRAF.toFixed(3);

			if (Math.floor(now / 1000) !== this.lastNow) {
				this.domStatusLoad.innerHTML = "FPS:" + (zoomer.frameNr - this.lastFrame) + " IPS:" + (zoomer.mainloopNr - this.lastLoop);
				this.lastNow = Math.floor(now / 1000);
				this.lastFrame = zoomer.frameNr;
				this.lastLoop = zoomer.mainloopNr;
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

			const rgba = new Uint8ClampedArray(frame.rgbaBuffer);
			const imagedata = new ImageData(rgba, frame.viewWidth, frame.viewHeight);

			// draw frame onto canvas
			this.ctx.putImageData(imagedata, 0, 0);
		}
	});

	// get context
	this.ctx = this.domZoomer.getContext("2d", {alpha: false});

	// small viewport for initial image
	this.viewportInit = new Viewport(64, 64);
	this.viewportInit.fill();
	this.zoomer.currentViewport.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle, this.viewportInit);

	// create formula engine
	this.calculator = new Formula();

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
	window.addEventListener("message", this.zoomer.handleMessage);

	// construct sliders
	this.speed = new Aria.Slider(this.domZoomSpeedThumb, this.domZoomSpeedRail,
		Config.zoomSpeedMin, Config.zoomSpeedMax, Config.zoomSpeedNow);
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

	// sliders
	this.speed.setCallbackValueChange((newValue) => {
		// scale exponentially
		newValue = Config.linearToLog(Config.zoomSpeedMin, Config.zoomSpeedMax, newValue);
		Config.zoomSpeedNow = newValue;
		this.domZoomSpeedLeft.innerHTML = newValue.toFixed(2);
	});
	this.rotateSpeed.setCallbackValueChange((newValue) => {
		Config.rotateSpeedNow = newValue;
		this.domRotateLeft.innerHTML = newValue.toFixed(1);
	});
	this.paletteSpeed.setCallbackValueChange((newValue) => {
		Config.paletteSpeedNow = newValue;
		this.domPaletteSpeedLeft.innerHTML = newValue.toFixed(0);
	});
	this.depth.setCallbackValueChange((newValue) => {
		newValue = Math.round(newValue);
		// needs to be a multiple of 4
		newValue = (newValue + 3) & ~3;
		Config.depthNow = newValue;
		this.domDepthLeft.innerHTML = newValue;
	});
	this.Framerate.setCallbackValueChange((newValue) => {
		newValue = Math.round(newValue);
		Config.framerateNow = newValue;
		this.domFramerateLeft.innerHTML = newValue;
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
		Config.autoPilot = newValue;
		if (newValue) {
			this.autopilotOn();
		} else {
			this.autopilotOff();
		}
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
		// fast clamp pixel values
		const viewport = this.zoomer.currentViewport;
		for (let ji = 0; ji < viewport.viewWidth * viewport.viewHeight; ji++)
			if (viewport.pixels[ji] !== 65535)
				viewport.pixels[ji] %= Config.paletteSize;
	});
}

/**
 * Handle keyboard down event
 *
 * @param {KeyboardEvent} event
 */
GUI.prototype.handleKeyDown = function (event) {
	conat = event.which || event.keyCode;

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

	this.mouseI = event.pageX - rect.left;
	this.mouseJ = event.pageY - rect.top;

	const viewport = (this.zoomer.frameNr & 1) ? this.zoomer.viewport1 : this.zoomer.viewport0;

	// relative to viewport center
	const dx = this.mouseI * viewport.radiusX * 2 / viewport.viewWidth - viewport.radiusX;
	const dy = this.mouseJ * viewport.radiusY * 2 / viewport.viewHeight - viewport.radiusY;
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
 * (re)load initial frame
 */
GUI.prototype.reload = function () {
	if (this.zoomer.onKeyFrame) this.zoomer.onKeyFrame(this.zoomer, this.zoomer.currentViewport, this.zoomer.currentFrame);
};

/**
 * @param {number} lookPixelRadius
 * @param {number} borderPixelRadius
 * @returns {boolean}
 */
GUI.prototype.updateAutopilot = function (viewport, lookPixelRadius, borderPixelRadius) {

	const config = window.config;
	const pixels = viewport.pixels;

	// use '>>1' as integer '/2'

	// coordinate within pixel data pointed to by mouse
	// todo: compensate rotation
	const api = ((Config.autopilotX - Config.centerX) / Config.radius + 1) * viewport.diameter >> 1;
	const apj = ((Config.autopilotY - Config.centerY) / Config.radius + 1) * viewport.diameter >> 1;

	const min = ((borderPixelRadius + 1) * (borderPixelRadius + 1)) >> 2;
	const max = min * 3;


	// outside center rectangle, adjust autopilot heading
	for (let k = 0; k < 450; k++) {
		const i0 = api + Math.floor(Math.random() * (2 * lookPixelRadius)) - lookPixelRadius;
		const j0 = apj + Math.floor(Math.random() * (2 * lookPixelRadius)) - lookPixelRadius;
		// convert to x/y
		const x = (i0 / viewport.diameter * 2 - 1) * Config.radius + Config.centerX;
		const y = (j0 / viewport.diameter * 2 - 1) * Config.radius + Config.centerY;
		// convert to viewport coords (use '>>1' as integer '/2'
		const i = (((x - Config.centerX) * Config.rcos - (y - Config.centerY) * Config.rsin + viewport.radiusX) * viewport.viewWidth / viewport.radiusX) >> 1;
		const j = (((x - Config.centerX) * Config.rsin + (y - Config.centerY) * Config.rcos + viewport.radiusY) * viewport.viewHeight / viewport.radiusY) >> 1;
		// must be visable
		if (i < borderPixelRadius || j < borderPixelRadius || i >= viewport.viewWidth - borderPixelRadius || j >= viewport.viewHeight - borderPixelRadius)
			continue;

		let c = 0;
		for (let j = j0 - borderPixelRadius; j <= j0 + borderPixelRadius; j++)
			for (let i = i0 - borderPixelRadius; i <= i0 + borderPixelRadius; i++)
				if (pixels[j * viewport.diameter + i] === 65535)
					c++;
		if (c >= min && c <= max) {
			Config.autopilotX = x;
			Config.autopilotY = y;
			Config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_LEFT;

			const i = (((x - Config.centerX) * Config.rcos - (y - Config.centerY) * Config.rsin + viewport.radiusX) * viewport.viewWidth / viewport.radiusX) >> 1;
			const j = (((x - Config.centerX) * Config.rsin + (y - Config.centerY) * Config.rcos + viewport.radiusY) * viewport.viewHeight / viewport.radiusY) >> 1;
			window.gui.domAutopilot.style.top = (j - borderPixelRadius) + "px";
			window.gui.domAutopilot.style.left = (i - borderPixelRadius) + "px";
			window.gui.domAutopilot.style.width = (borderPixelRadius * 2) + "px";
			window.gui.domAutopilot.style.height = (borderPixelRadius * 2) + "px";
			window.gui.domAutopilot.style.border = '4px solid green';
			return true;
		}
	}

	Config.autopilotButtons = 0;
	window.gui.domAutopilot.style.border = '4px solid red';
	return false;
};

GUI.prototype.autopilotOn = function () {

	const viewport = (this.zoomer.frameNr & 1) ? this.zoomer.viewport1 : this.zoomer.viewport0;
	Config.autopilotX = Config.centerX;
	Config.autopilotY = Config.centerY;

	let lookPixelRadius = viewport.diameter >> 1;
	const borderPixelRadius = viewport.diameter >> 5;
	do {
		if (!this.updateAutopilot(viewport, lookPixelRadius, 16))
			break;
		lookPixelRadius >>= 1;
	} while (lookPixelRadius > 2);
};

GUI.prototype.autopilotOff = function () {
	this.mouseButtons = 0;
	this.domAutopilot.style.border = 'none';

};
