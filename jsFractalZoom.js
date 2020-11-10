/*
 *  This file is part of jsFractalZoom - Fractal zoomer written in javascript
 *
 *  Copyright (C) 2018, xyzzy@rockingship.org
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

	/** @member {float} - zoom magnification */
	Config.zoomAccelManual = 20;
	/** @member {float} - zoom magnification */
	Config.zoomAccelAuto = 2;
	/** @member {float} - zoom magnification slider Min */
	Config.zoomAccelMin = Math.log(1.01);
	/** @member {float} - zoom magnification slider Max */
	Config.zoomAccelMax = Math.log(25.0);
	/** @member {float} - zoom magnification slider Now */
	Config.zoomAccelNow = Math.log(Config.zoomAccelManual);

	/** @member {float} - rotate speed slider Min */
	Config.rotateSpeedMin = -0.5;
	/** @member {float} - rotate speed slider Max */
	Config.rotateSpeedMax = +0.5;
	/** @member {float} - rotate speed slider Now */
	Config.rotateSpeedNow = 0;

	/** @member {float} - palette cycle slider Min */
	Config.paletteSpeedMin = -30.0;
	/** @member {float} - palette cycle slider Max */
	Config.paletteSpeedMax = +30.0;
	/** @member {float} - palette cycle slider Now */
	Config.paletteSpeedNow = 0;

	/** @member {float} - density slider Min */
	Config.density = 1; // actual value
	/** @member {float} - density slider Min */
	Config.densityMin = Math.log(0.0001);
	/** @member {float} - density slider Max */
	Config.densityMax = Math.log(20);
	/** @member {float} - density slider Now */
	Config.densityNow = Math.log(Config.density);

	/** @member {float} - calculation depth slider Min */
	Config.framerateMin = 1;
	/** @member {float} - calculation depth slider Max */
	Config.framerateMax = 60;
	/** @member {float} - calculation depth slider Now */
	Config.framerateNow = 20;

	/** @member {float} - center X coordinate - vsync updated */
	Config.centerX = 0;
	/** @member {float} - center Y coordinate - vsync updated */
	Config.centerY = 0;
	/** @member {float} - distance between center and view corner - vsync updated */
	Config.radius = 0;
	/** @member {float} - current view angle (degrees) - timer updated */
	Config.angle = 0;
	/** @member {int} - max Iteration for calculations */
	Config.maxIter = 0;
	/** @member {float} - Auto adapting low-pass coefficient */
	Config.maxIterCoef = 0.01;
	/** @member {int} - Auto adapting AllocateAhead */
	Config.maxIterBump = 100;

	/** @member {float} - current palette offset - timer updated */
	Config.paletteOffsetFloat = 0;
	/** @member {int} - Palette size before colours start repeating */
	Config.paletteSize = 0;

	/** @member {int} - Palette theme  */
	Config.theme = Math.round(Math.random() * 8);

	/** @member {int} - Starting seed for palette  */
	Config.seed = Math.round(Math.random() * 2147483647);

	/** @member {float} - current view zoomSpeed - timer updated */
	Config.zoomSpeed = 0;
	/** @member {float} - After 1sec, get 80% closer to target speed */
	Config.zoomSpeedCoef = 0.80;

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
 * Load config from query string
 *
 * @param {string} query
 */
Config.load = function (query) {
	const vars = query.split('&');
	for (let i = 0; i < vars.length; i++) {
		const [k, v] = vars[i].split('=');
		if (k === "x")
			Config.centerX = Number.parseFloat(v);
		else if (k === "y")
			Config.centerY = Number.parseFloat(v);
		else if (k === "r")
			Config.radius = Number.parseFloat(v);
		else if (k === "a")
			Config.angle = Number.parseFloat(v);
		else if (k === "density") {
			Config.density = Number.parseFloat(v);
			Config.densityNow = Math.log(Config.density);
		} else if (k === "iter")
			Config.maxIter = Number.parseInt(v);
		else if (k === "theme")
			Config.theme = Number.parseInt(v);
		else if (k === "seed")
			Config.seed = Number.parseInt(v);
		else if (k === "formula")
			Formula.formula = Number.parseInt(v);
		else if (k === "incolour")
			Formula.incolour = Number.parseInt(v);
		else if (k === "outcolour")
			Formula.outcolour = Number.parseInt(v);
		else if (k === "plane")
			Formula.plane = Number.parseInt(v);
	}
}

/**
 * set initial position
 */
Config.home = function () {
	const initial = Formula.initial[Formula.formula];

	Config.centerX = initial.x;
	Config.centerY = initial.y;
	Config.radius = initial.r;
	Config.angle = initial.a;

	// reset maxiter
	Config.maxIter = 300;

	// reset autopilot
	Config.autopilotX = 0;
	Config.autopilotY = 0;

	// reset palette density
	Config.density = 1;
	Config.densityNow = Math.log(Config.density);
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
	/** @member {Uint8Array} - Red */
	this.R = new Uint8Array(65536);
	/** @member {Uint8Array} - Green */
	this.G = new Uint8Array(65536);
	/** @member {Uint8Array} - Blue */
	this.B = new Uint8Array(65536);

	/** @member {int} - Length of a single "logical" cycle */
	this.rgbSize = 0;

	/** @member {Uint32Array} - "Physical" palette scaled with `Config.density` to span 65535 entries */
	this.palette = new Uint32Array(65536);

	/** @member {int} - Number of entries in palette[] for a complete cycle  */
	this.paletteSize = 0;


	/** @member {int} - current PRNG seed  */
	this.seed = 0;

	/**
	 * Create a random number in range 0 <= return < n
	 *
	 * @date 2020-11-04 13:05:20
	 * Javascript does not have a seedable number generator.
	 * Implement MINSTD with reduced range
	 *
	 * @function
	 * @param n
	 * @returns {number}
	 */
	this.random = function (n) {
		this.seed = Number(BigInt(this.seed) * 48271n % 2147483647n);

		// NOTE: n is non-inclusive upper bound
		return Number(BigInt(this.seed) * BigInt(n) / 2147483647n);
	};

	this.mksmooth = function (nsegments, segmentsize, R, G, B) {
		// set palette modulo size
		this.rgbSize = nsegments * segmentsize;

		let k = 0;
		for (let i = 0; i < nsegments; i++) {
			let r = R[i];
			let g = G[i];
			let b = B[i];
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
			for (let i = 0; i < nsegments; i += 2) {
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
			rcycle = this.random(128) + 8;
			gcycle = this.random(128) + 8;
			bcycle = this.random(128) + 8;
			this.rgbSize = Math.round(rcycle * gcycle * bcycle);
		} while (this.rgbSize < 0xc000 || this.rgbSize >= 0xffff);

		const t0 = this.random(10000) * 2 * Math.PI / 10000;
		for (let i = 0; i < this.rgbSize; i++) {
			this.palette[i] =
				(128.0 + 127 * Math.sin(Math.PI * i / rcycle + t0)) << 0 | // Red
				(128.0 + 127 * Math.sin(Math.PI * i / gcycle + t0)) << 8 | // Green
				(128.0 + 127 * Math.sin(Math.PI * i / bcycle + t0)) << 16 | // Blue
				255 << 24; // Alpha
		}
	}

	this.randomize_segments5 = function (whitemode) {

		this.rgbSize = 1000; // magic number so it looks good with density=1
		for (let i = 0; i < this.rgbSize; i++) {
			const g = whitemode ? 255 - Math.round(i * 255 / this.rgbSize) : Math.round(i * 255 / this.rgbSize);

			this.palette[i] =
				g << 0 | // Red
				g << 8 | // Green
				g << 16 | // Blue
				255 << 24; // Alpha
		}
	}

	this.loadTheme = function () {
		// set PRNG seed for this palette
		this.seed = Config.seed;

		let segmentsize, nsegments;
		const whitemode = this.random(2);

		{
			// XaoS code
			nsegments = this.random(10);
			nsegments += this.random(10);
			nsegments += this.random(10);
			nsegments += this.random(10); // Make smaller segments with higher probability

			segmentsize = Math.floor(160 / nsegments); // magic number so it looks good with density=1
		}

		switch (Config.theme) {
		case 0:
			this.randomize_segments1(whitemode, nsegments, segmentsize);
			break;
		case 1:
			this.randomize_segments2(whitemode, nsegments, segmentsize);
			break;
		case 2:
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
			this.randomize_segments4(whitemode);
			break;
		case 7:
			this.randomize_segments5(whitemode);
			break;
		}
	};

	this.mkrandom = function () {
		// get a new random number
		Config.seed = Math.round(Math.random() * 2147483647);

		// rotate though palette themes
		Config.theme = (Config.theme + 1) % 8;

		this.loadTheme();
	}

	/**
	 * Set palette
	 *
	 * @param {Uint32Array} out32  - frame.palette
	 * @param {int}         offset - Starting position for colour rotation
	 * @param {int}         maxIter - Starting position for colour rotation
	 */
	this.setPalette = function (out32, offset, maxIter) {

		const {palette, rgbSize} = this;

		// palette offset may not be negative
		if (offset < 0)
			offset = (rgbSize - 1) - (-offset - 1) % rgbSize;
		else
			offset = offset % rgbSize;

		/*
		 * @date 2020-11-07 00:27:00
		 *
		 * Assume rgbSize > densityNow
		 * Integer arithmetic to avoid slow floats
		 * offset is 16 bits, 0..65535
		 * scale by 15 bits to fit into 31 bits int.
		 *
		 * Following is to optimize `palette[Math.round(i * densityNow) % rgbSize];
		 */

		const stepK = Math.round(Config.density * 32768);
		const maxK = rgbSize * 32768;
		let k = offset * 32768;

		// copy palette and apply colour cycling
		for (let i = 0; i < maxIter; i++) {

			// copy pixel
			out32[i] = palette[k >> 15];

			// increment k
			k += stepK;
			if (k >= maxK)
				k -= maxK;
		}

		// background colour
		out32[65535] = 0x00000000; // transparent
	};
}

/**
 * DOM bindings and event handlers
 *
 * @class
 */
function GUI() {
	/*
	 * DOM elements and their matching id's
	 */
	this.domZoomer = "idZoomer";
	this.domStatusTitle = "idStatusTitle";
	this.domStatusPosition = "idStatusPosition";
	this.domStatusLoad = "idStatusLoad";
	this.domStatusRect = "idStatusRect";
	this.domNavWrapper = "idNavWrapper";
	this.domNav = "idNav";
	this.domTop = "idTop";
	this.domPowerButton = "idPowerButton";
	this.domAutoPilotButton = "idAutoPilotButton";
	this.domHomeButton = "idHomeButton";
	this.domSaveButton = "idSaveButton";
	this.domUrlButton = "idUrlButton";
	this.domPopup = "idPopup";
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
	this.domThemeButton = "idThemeButton";
	this.domDensityLeft = "idDensityLeft";
	this.domDensityRail = "idDensityRail";
	this.domDensityThumb = "idDensityThumb";
	this.domFramerateLeft = "idFramerateLeft";
	this.domFramerateRail = "idFramerateRail";
	this.domFramerateThumb = "idFramerateThumb";
	this.domWxH = "WxH";
	this.domAutopilot = "idAutopilot";
	this.domResize = "idResize";

	/** @member {number} - view mouse X coordinate */
	this.mouseU = 0;
	this.mouseX = 0;
	/** @member {number} - view mouse Y coordinate */
	this.mouseV = 0;
	this.mouseY = 0;
	/** @member {number} - view mouse button state. OR-ed set of Aria.ButtonCode */
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

	/*
	 * Construct UI components
	 */

	// construct sliders
	this.speed = new Aria.Slider(this.domZoomSpeedThumb, this.domZoomSpeedRail,
		Config.zoomAccelMin, Config.zoomAccelMax, Config.zoomAccelNow);
	this.rotateSpeed = new Aria.Slider(this.domRotateThumb, this.domRotateRail,
		Config.rotateSpeedMin, Config.rotateSpeedMax, Config.rotateSpeedNow);
	this.paletteSpeed = new Aria.Slider(this.domPaletteSpeedThumb, this.domPaletteSpeedRail,
		Config.paletteSpeedMin, Config.paletteSpeedMax, Config.paletteSpeedNow);
	this.density = new Aria.Slider(this.domDensityThumb, this.domDensityRail,
		Config.densityMin, Config.densityMax, Config.densityNow);
	this.Framerate = new Aria.Slider(this.domFramerateThumb, this.domFramerateRail,
		Config.framerateMin, Config.framerateMax, Config.framerateNow);

	// construct controlling listbox button
	this.formula = new Aria.ListboxButton(this.domFormulaButton, this.domFormulaList);
	this.incolour = new Aria.ListboxButton(this.domIncolourButton, this.domIncolourList);
	this.outcolour = new Aria.ListboxButton(this.domOutcolourButton, this.domOutcolourList);
	this.plane = new Aria.ListboxButton(this.domPlaneButton, this.domPlaneList);

	// set lists
	this.formula.listbox.focusItem(document.getElementById("formula_" + Formula.formula));
	this.incolour.listbox.focusItem(document.getElementById("incolour_" + Formula.incolour));
	this.outcolour.listbox.focusItem(document.getElementById("outcolour_" + Formula.outcolour));
	this.plane.listbox.focusItem(document.getElementById("plane_" + Formula.plane));

	// construct buttons
	this.power = new Aria.Button(this.domPowerButton, false);
	this.autoPilot = new Aria.Button(this.domAutoPilotButton, false);
	this.home = new Aria.Button(this.domHomeButton, true);
	this.save = new Aria.Button(this.domSaveButton, true);
	this.url = new Aria.Button(this.domUrlButton, true);
	this.theme = new Aria.Button(this.domThemeButton, true);

	/*
	 * It's easier to redraw the sliders than to hack "em" into them
	 */
	this.redrawSliders = () => {
		this.speed.moveSliderTo(this.speed.valueNow);
		this.rotateSpeed.moveSliderTo(this.rotateSpeed.valueNow);
		this.paletteSpeed.moveSliderTo(this.paletteSpeed.valueNow);
		this.density.moveSliderTo(this.density.valueNow);
		this.Framerate.moveSliderTo(this.Framerate.valueNow);
	}

	/*
	 * Set fontsize
	 */
	this.setFontSize = () => {
		const viewWidth = document.body.clientWidth;
		const viewHeight = document.body.clientHeight;

		/*
		 * @date 2020-11-10 00:49:49
		 * `idTop` depends on body.fontSize
		 * `idNav` depends on `idTop`
		 * body.fontSize depends on `idNav`
		 *
		 * Perform a couple of iterations to create a stable situation.
		 * This only happens during resize events, so the overhead should not be a big problem.
		 */
		for (let iRound=0; iRound<10; iRound++) {
			{
				// `top` box is 5em high, and takes 10% of screen height
				// zoomer is 100% wide, 100% high and a 1em border
				let numLines = 5;
				let lineHeight;

				if (viewWidth > viewHeight) {
					// landscape, top box is 1/10th total available height and contains 5 lines
					lineHeight = viewHeight / 10 / numLines;

					// shrink font if current size would exceed 16:1 aspect ratio
					if (lineHeight > viewWidth / 16 / numLines)
						lineHeight = viewWidth / 16 / numLines;
				} else {
					// portrait
					// set lineHeight that it spans full width
					lineHeight = viewWidth / 16 / numLines;

					// shrink if exceeds 1/10th available height
					if (lineHeight > viewHeight / 10 / numLines)
						lineHeight = viewHeight / 10 / numLines;
				}

				// assume fontSize = lineheight / 1.2
				let fontSize = lineHeight / 1.2;

				// set fontsize (em)
				this.domTop.style.fontSize = fontSize + "px";
			}

			/*
			 * If `idTop` top margin is "1em", determine height of "idTop" in em
			 */
			let topEm;
			{
				const rect = this.domTop.getBoundingClientRect();

				topEm = 1 + ((rect.bottom - rect.top) / rect.top) + 0.5;
				this.domNavWrapper.style.top = topEm + "em";
			}

			{
				const rect = this.domNavWrapper.getBoundingClientRect();

				// fontSize for landscape
				let fontSize = document.body.clientHeight / (topEm + 34.4 + 1); // `idNav` has a top/bottom of 7em/1em

				// scale down when portrait to fit width
				if ((1 + 32.8 + 1) * fontSize > document.body.clientWidth)
					fontSize = fontSize * document.body.clientWidth / ((1 + 32.8 + 1) * fontSize);

				document.body.style.fontSize = fontSize + "px";
			}

			this.redrawSliders();
		}
	};

	/*
	 * Create the zoomer
	 */
	this.zoomer = new Zoomer(this.domZoomer, false, {

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

			this.setFontSize();
		},

		/**
		 * Additional allocation of a new frame.
		 * Setup optional palette and add custom settings
		 * NOTE: each frame has it's own palette.
		 *
		 * @param {Zoomer}   zoomer - This
		 * @param {ZoomerFrame} frame  - Frame being initialized.
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
		 * @param {Zoomer}   zoomer        - This
		 * @param {ZoomerView}  calcView  - View about to be constructed
		 * @param {ZoomerFrame} calcFrame - Frame about to be constructed
		 * @param {ZoomerView}  dispView  - View to extract rulers
		 * @param {ZoomerFrame} dispFrame - Frame to extract pixels
		 */
		onBeginFrame: (zoomer, calcView, calcFrame, dispView, dispFrame) => {
			/*
			 * how many seconds since last call
			 * @date 2020-10-23 22:57:15
			 * The time differences on individual frames are too large and is visible as stuttering.
			 * Trying again with a more stable metrics
			 */
			// const diffSec = (currentFrame.timeStart - displayFrame.timeStart) / 1000;
			const diffSec = (1000 / zoomer.avgFrameRate) / 1000;

			this.zoomer.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle);

			// maxIter for embedded calc(), maxDepth for formula.js
			this.domStatusTitle.innerHTML = JSON.stringify({x: Config.centerX, y: Config.centerY, radius: Config.radius, angle: Config.angle, density: Config.density, iter: Config.maxIter, quality: dispFrame.quality});
		},

		/**
		 * This is done for every pixel. optimize well!
		 *
		 * @param {Zoomer}   zoomer  - This
		 * @param {ZoomerFrame} frame   - This
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
		 * Extract rotated view from pixels and store them in specified imagedata.
		 * Called just before submitting the frame to a web-worker.
		 * Previous frame is complete, current frame is under construction.
		 *
		 * @param {Zoomer} zoomer - This
		 * @param {ZoomerFrame} frame  - Previous frame
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
		 * @param {ZoomerFrame} frame  - Current frame
		 */
		onEndFrame: (zoomer, frame) => {

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
					PPF: Math.round(zoomer.avgPixelsPerFrame),
					LPF: Math.round(zoomer.avgLinesPerFrame),
					RT: Math.round(zoomer.avgRoundTrip),
					reqFPS: Math.round(zoomer.frameRate * 10) / 10,
					actFPS: Math.round(zoomer.avgFrameRate * 10) / 10,
					drop: zoomer.cntDropped
				});

				this.lastNow = now;
			}
		},

		/**
		 * Inject frame into canvas.
		 * This is a callback to keep all canvas resource handling/passing out of Zoomer context.
		 *
		 * @param {Zoomer}   zoomer - This
		 * @param {ZoomerFrame} frame  - Frame to inject
		 */
		onPutImageData: (zoomer, frame) => {

			/*
			 * Inject JSON into frame
			 */
			const json = JSON.stringify({
				x: Config.centerX,
				y: Config.centerY,
				r: Config.radius,
				a: Config.angle,
				iter: Config.maxIter,
				theme: Config.theme,
				seed: Config.seed,
				formula: Formula.formula,
				incolour: Formula.incolour,
				outcolour: Formula.outcolour,
				plane: Formula.plane,
			});

			let k = frame.viewWidth + 1; // skip first line and column
			let maxk = frame.viewWidth * frame.viewHeight;
			let rgba = frame.rgba;
			done:
				for (let j = 0; j < json.length; j++) {
					let code = json.charCodeAt(j);
					for (let i = 0; i < 8; i++) {
						// pixel must not be transparent
						while (!rgba[k]) {
							if (k >= maxk)
								break done;
							k++;
						}

						// inject bit
						if (code & 1)
							rgba[k] |= 1;
						else
							rgba[k] &= ~1;
						code >>= 1;

						if (k >= maxk)
							break done;
						k++;
					}
				}

			/*
			 * draw frame onto canvas
			 */
			const imageData = new ImageData(new Uint8ClampedArray(frame.rgba.buffer), frame.viewWidth, frame.viewHeight);
			this.ctx.putImageData(imageData, 0, 0);
		}
	});

	/*
	 * @date 2020-10-15 13:08:13
	 * `desynchronized` dramatically speed enhances `putImageData()` but it might also glitch mouse movement when hovering over the canvas.
	 * `alpha` might have an effect, however not noticed yet.
	 */

	/** @member {CanvasRenderingContext2D} */
	this.ctx = this.domZoomer.getContext("2d", {desynchronized: true});

	/*
	 * callbacks and listeners
	 */

	// sliders
	this.speed.setCallbackValueChange((newValue) => {

		Config.zoomAccelNow = newValue;

		const zoomAccel = Math.round(Math.exp(newValue) * 10) / 10; // round

		if (Config.autoPilot)
			Config.zoomAccelAuto = zoomAccel;
		else
			Config.zoomAccelManual = zoomAccel;

		this.domZoomSpeedLeft.innerHTML = zoomAccel;
	});
	this.rotateSpeed.setCallbackValueChange((newValue) => {
		if (newValue > -0.01 && newValue < +0.01)
			newValue = 0; // snap to center
		Config.rotateSpeedNow = newValue;
		this.domRotateLeft.innerHTML = newValue.toFixed(2);

		/*
		 * Rotation is a CPU hit, enable/disable appropriately
		 */
		if (newValue) {
			// rotating, enable
			if (!this.zoomer.enableAngle)
				this.zoomer.resize(this.zoomer.viewWidth, this.zoomer.viewHeight, true);
		} else if (this.zoomer.angle === 0) {
			// stopped and horizontal, disable
			if (this.zoomer.enableAngle)
				this.zoomer.resize(this.zoomer.viewWidth, this.zoomer.viewHeight, false);
		}
	});
	this.paletteSpeed.setCallbackValueChange((newValue) => {
		if (newValue > -1 && newValue < +1)
			newValue = 0; // snap to center
		Config.paletteSpeedNow = newValue;
		this.domPaletteSpeedLeft.innerHTML = newValue.toFixed(0);
	});
	this.density.setCallbackValueChange((newValue) => {
		Config.densityNow = newValue;
		Config.density = Math.exp(newValue);
		// round
		Config.density = Math.round(Config.density * 10000) / 10000;
		this.domDensityLeft.innerHTML = Config.density;
	});
	this.Framerate.setCallbackValueChange((newValue) => {
		newValue = Math.round(newValue);
		Config.framerateNow = newValue;
		this.domFramerateLeft.innerHTML = newValue;

		this.zoomer.frameRate = Config.framerateNow;
	});

	// listboxes
	this.formula.listbox.setCallbackFocusChange((focusedItem) => {
		this.domFormulaButton.innerText = focusedItem.innerText;
		const formula = focusedItem.id.substr(8) | 0;
		if (Formula.formula !== formula) {
			Formula.formula = formula;
			Config.home();
			this.reload();
		}
	});
	this.incolour.listbox.setCallbackFocusChange((focusedItem) => {
		this.domIncolourButton.innerText = focusedItem.innerText;
		const incolour = focusedItem.id.substr(9) | 0;
		if (Formula.incolour !== incolour) {
			Formula.incolour = incolour;
			this.reload();
		}
	});
	this.outcolour.listbox.setCallbackFocusChange((focusedItem) => {
		this.domOutcolourButton.innerText = focusedItem.innerText;
		const outcolour = focusedItem.id.substr(10) | 0;
		if (Formula.outcolour !== outcolour) {
			Formula.outcolour = outcolour;
			this.reload();
		}
	});
	this.plane.listbox.setCallbackFocusChange((focusedItem) => {
		this.domPlaneButton.innerText = focusedItem.innerText;
		const plane = focusedItem.id.substr(6) | 0;
		if (Formula.plane !== plane) {
			Formula.plane = plane;
			Config.home();
			this.reload();
		}
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
		const magnify = Math.pow(Config.autoPilot ? Config.zoomAccelAuto : Config.zoomAccelManual, Config.zoomSpeed)

		Config.autoPilot = newValue;

		if (Config.autoPilot) {
			Config.zoomAccelNow = Math.log(Config.zoomAccelAuto);
			Config.zoomSpeed = Math.log(magnify) / Math.log(Config.zoomAccelAuto);
			this.autopilotOn();
		} else {
			Config.zoomAccelNow = Math.log(Config.zoomAccelManual);
			Config.zoomSpeed = Math.log(magnify) / Math.log(Config.zoomAccelManual);
			this.autopilotOff();
		}

		this.speed.moveSliderTo(Config.zoomAccelNow);
		this.speed.updateLabels();
	});
	this.home.setCallbackValueChange((newValue) => {
		Config.home();
		this.reload();
	});
	this.save.setCallbackValueChange((newValue) => {
		/*
		 * Popup
		 */
		this.domPopup.innerText = "saving";
		this.domPopup.className = "active";
		setTimeout(() => {
			this.domPopup.className = "";
		}, 2000)

		// save image through clicking hidden <a href="blob"/>
		const link = document.createElement("a");
		link.download = "image.png";
		this.domZoomer.toBlob(function (blob) {
			link.href = URL.createObjectURL(blob);
			link.click();
		}, "image/png");
	});
	this.url.setCallbackValueChange((newValue) => {
		/*
		 * Inject JSON into frame
		 */
		const obj = {
			x: Config.centerX,
			y: Config.centerY,
			r: Config.radius,
			a: Config.angle,
			density: Config.density,
			iter: Config.maxIter,
			theme: Config.theme,
			seed: Config.seed,
			formula: Formula.formula,
			incolour: Formula.incolour,
			outcolour: Formula.outcolour,
			plane: Formula.plane,
		};

		// convert to query string
		let qarr = [];
		for (let k in obj) {
			qarr.push(k + '=' + obj[k]);
		}
		let qstr = qarr.join("&");

		/*
		 * Copy to clipboard
		 * NOTE: the following only works when called from a "click" event.
		 */
		const copyText = document.getElementById("idCopyText");
		copyText.style.display = "block";
		copyText.value = location.origin + location.pathname + '?' + qstr;

		copyText.select();
		copyText.setSelectionRange(0, 99999);
		document.execCommand("copy");

		/*
		 * Popup
		 */
		this.domPopup.innerText = "copied to clipboard";
		this.domPopup.className = "active";
		setTimeout(() => {
			this.domPopup.className = "";
		}, 2000)
	});
	this.theme.setCallbackValueChange(() => {
		palette.mkrandom();

		/*
		 * @date 2020-10-15 13:02:00
		 * call `setPosition` to force a new frame to avoid colour glitching.
		 * This shouldn't happen because of event queue isolation.
		 * However, this handler is UI event context and `renderFrame()` is `postMessage()` context.
		 */
		this.zoomer.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle);
	});

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
	document.addEventListener("wheel", (e) => {
		e.preventDefault();

		/*
		 * Node: the slider has logarithmic values. "Times N" is "add log(N)"
		 *
		 * @date 2020-11-08 01:50:53
		 * Chrome does WheelEvent.DOM_DELTA_PIXEL with +/- 150
		 * Firefox does WheelEvent.DOM_DELTA_LINE with +/- 3
		 *
		 * Do simple, and move slide 1 position per event
		 */

		let delta = e.deltaY;
		if (delta >= 1) {
			let newValue = Config.densityNow + Math.log(1.05);
			if (newValue > Config.densityMax)
				newValue = Config.densityMax;

			Config.densityNow = newValue;
			Config.density = Math.exp(newValue);
			Config.density = Math.round(Config.density * 10000) / 10000; // round
		}
		if (delta <= -1) {
			let newValue = Config.densityNow - Math.log(1.05);
			if (newValue < Config.densityMin)
				newValue = Config.densityMin;

			Config.densityNow = newValue;
			Config.density = Math.exp(newValue);
			Config.density = Math.round(Config.density * 10000) / 10000; // round
		}

		this.density.moveSliderTo(Config.densityNow);
	}, {passive: false});
	this.domResize.addEventListener("mousedown", (e0) => {
		e0.preventDefault();

		// where (procent-wise) in the parent element did the click occur
		const navRect = this.domNavWrapper.getBoundingClientRect();

		const mouseMove = (e) => {
			e0.preventDefault();

			/*
			 * Calculate point on line that is closest to mouse
			 * line: y = (34.4 / 32) * x
			 */
			// mouse position relative to top-right `idNav`.
			// where 0<=y<=1, scale x accordingly
			let mouseX = (navRect.right - e.clientX) / (navRect.bottom - navRect.top);
			let mouseY = (e.clientY - navRect.top) / (navRect.bottom - navRect.top);

			// determine point on line (allowed positions of the resizer)
			let a = -(34.4 / 32);
			let b = 1;
			let c = 0;
			let x = (b*(b*mouseX-a*mouseY)-a*c) / (a*a+b*b);
			let y = (a*(a*mouseY-b*mouseX)-b*c) / (a*a+b*b);

			// limits
			if (y > 1)
				y = 1;
			else if (y < 0.2)
				y = 0.2;

				// set relative fontsize
			this.domNav.style.fontSize = y + "em";

			this.redrawSliders();
		};
		const mouseUp = (e) => {
			e0.preventDefault();

			document.body.removeEventListener("mousemove", mouseMove);
			document.body.removeEventListener("mouseup", mouseUp);
		};

		document.body.addEventListener("mousemove", mouseMove);
		document.body.addEventListener("mouseup", mouseUp);
	});

	setInterval((e) => {
		// seconds since last cycle
		const now = performance.now();
		const diffSec = this.directionalInterval / 1000;
		const calcView = this.zoomer.calcView;

		if (Config.autoPilot) {
			if (calcView.reachedLimits()) {
				Config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_RIGHT;
				gui.domAutopilot.style.border = "4px solid orange";
			} else {
				this.domStatusPosition.innerHTML = "";

				if (!this.updateAutopilot(calcView, 4, 16))
					if (!this.updateAutopilot(calcView, 60, 16))
						if (!this.updateAutopilot(calcView, Math.min(calcView.pixelWidth, calcView.pixelHeight) >> 1, 16))
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
		 * Update view angle (before zoom gestures)
		 */
		if (Config.rotateSpeedNow) {
			Config.angle += diffSec * Config.rotateSpeedNow * 360;

			// fold range
			if (Config.angle < 0)
				Config.angle += 360;
			else if (Config.angle >= 360)
				Config.angle -= 360;

			// round
			Config.angle = Math.round(Config.angle * 100) / 100;
		}

		// drag gesture
		if (this.mouseButtons === (1 << Aria.ButtonCode.BUTTON_WHEEL)) {
			// need screen coordinates to avoid drifting
			const dispView = this.zoomer.dispView;
			const {dx, dy} = dispView.screenUVtoCoordDXY(this.mouseU, this.mouseV, Config.angle);

			if (!this.dragActive) {
				// save the fractal coordinate of the mouse position. that stays constant during the drag gesture
				this.dragCenterX = dispView.centerX + dx;
				this.dragCenterY = dispView.centerY + dy;
				this.dragActive = true;
			}

			// update x/y but keep radius
			Config.centerX = this.dragCenterX - dx;
			Config.centerY = this.dragCenterY - dy;

			// mark visual center
			const borderPixelRadius = 4;
			gui.domAutopilot.style.top = ((this.zoomer.viewHeight >> 1) - borderPixelRadius) + "px";
			gui.domAutopilot.style.left = ((this.zoomer.viewWidth >> 1) - borderPixelRadius) + "px";
			gui.domAutopilot.style.width = (borderPixelRadius * 2) + "px";
			gui.domAutopilot.style.height = (borderPixelRadius * 2) + "px";
			gui.domAutopilot.style.border = "4px solid green";

		} else if (this.dragActive) {
			this.dragActive = false;
			gui.domAutopilot.style.border = "";
		}

		// zoom-in/out gesture
		if (Config.zoomSpeed) {
			// convert normalised zoom speed (-1<=speed<=+1) to magnification and scale to this time interval
			const magnify = Math.pow(Config.autoPilot ? Config.zoomAccelAuto : Config.zoomAccelManual, Config.zoomSpeed * diffSec);

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

	/*
	 * Constructor
	 */
	{
		// Create a small key frame (mandatory)
		const keyView = new ZoomerView(64, 64, 64, 64); // Explicitly square

		// Calculate all the pixels, or choose any other content (optional)
		keyView.fill(Config.centerX, Config.centerY, Config.radius, Config.angle, this.zoomer, this.zoomer.onUpdatePixel);

		// set initial position and inject key frame (mandatory)
		this.zoomer.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle, keyView)

		// snap to actual dimensions
		this.setFontSize();
	}
}

/**
 * Handle keyboard down event
 *
 * @param {KeyboardEvent} event
 */
GUI.prototype.handleKeyDown = function (event) {
	// Grab the keydown and click events
	switch (event.key) {
	case "A":
	case "a":
		this.autoPilot.buttonDown();
		this.domAutoPilotButton.focus();
		break;
	case "C":
		this.paletteSpeed.moveSliderTo(this.paletteSpeed.valueNow + 1);
		this.domPaletteSpeedThumb.focus();
		break;
	case "c":
		this.paletteSpeed.moveSliderTo(this.paletteSpeed.valueNow - 1);
		this.domPaletteSpeedThumb.focus();
		break;
	case "D":
	case "d":
		this.paletteGroup.radioButtons[1].buttonDown();
		this.domDefaultPaletteButton.focus();
		break;
	case "F":
	case "f":
		if (!this.formula.toggleListbox(event))
			this.domZoomer.focus();
		break;
	case "I":
	case "i":
		if (!this.incolour.toggleListbox(event))
			this.domZoomer.focus();
		break;
	case "O":
	case "o":
		if (!this.outcolour.toggleListbox(event))
			this.domZoomer.focus();
		break;
	case "P":
	case "p":
		if (!this.plane.toggleListbox(event))
			this.domZoomer.focus();
		break;
	case "Q":
	case "q":
		this.power.buttonDown();
		this.domPowerButton.focus();
		break;
	case "R":
		this.rotateSpeed.moveSliderTo(Config.rotateSpeedNow + (this.rotateSpeed.valueMax - this.rotateSpeed.valueMin) / 100);
		this.domRotateThumb.focus();
		break;
	case "r":
		this.rotateSpeed.moveSliderTo(Config.rotateSpeedNow - (this.rotateSpeed.valueMax - this.rotateSpeed.valueMin) / 100);
		this.domRotateThumb.focus();
		break;
	case "S":
	case "s":
		this.save.buttonDown();
		this.domZoomer.focus();
		break;
	case "T":
	case "t":
		this.theme.buttonDown();
		this.domZoomer.focus();
		break;
	case "U":
	case "u":
		this.url.buttonDown();
		this.domZoomer.focus();
		break;
	case "Z":
		this.speed.moveSliderTo(this.speed.valueNow + Math.log(1.05)); // raise 5%
		this.domZoomSpeedThumb.focus();
		break;
	case "z":
		this.speed.moveSliderTo(this.speed.valueNow - Math.log(1.05)); // lower 5%
		this.domZoomSpeedThumb.focus();
		break;
	case "Home":
		this.home.buttonDown();
		this.domHomeButton.focus();
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
	// Grab the keydown and click events
	switch (event.key) {
	case "A":
	case "a":
		this.autoPilot.buttonUp();
		this.domZoomer.focus();
		break;
	case "C":
	case "c":
		this.domZoomer.focus();
		break;
	case "D":
	case "d":
		this.paletteGroup.radioButtons[1].buttonUp();
		this.domZoomer.focus();
		break;
	case "Q":
	case "q":
		this.power.buttonUp();
		this.domZoomer.focus();
		break;
	case "R":
	case "r":
		this.domZoomer.focus();
		break;
	case "S":
	case "s":
		this.save.buttonUp();
		this.domZoomer.focus();
		break;
	case "T":
	case "t":
		this.theme.buttonUp();
		this.domZoomer.focus();
		break;
	case "U":
	case "u":
		this.url.buttonUp();
		this.domZoomer.focus();
		break;
	case "Z":
	case "z":
		this.domZoomer.focus();
		break;
	case "Home":
		this.home.buttonUp();
		this.domZoomer.focus();
		break;
	default:
		return;
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

	// determine mouse screen position
	this.mouseU = event.pageX - rect.left;
	this.mouseV = event.pageY - rect.top;

	/*
	 * @date 2020-10-26 12:42:18
	 * Use the view angle as that is what you see when clicking. `Config.angle` lags behind.
	 */
	const view = (this.zoomer.frameNr & 1) ? this.zoomer.view1 : this.zoomer.view0;
	let {dx, dy} = view.screenUVtoCoordDXY(this.mouseU, this.mouseV, Config.angle);

	this.mouseX = Config.centerX + dx;
	this.mouseY = Config.centerY + dy;

	/*
	 * Encountered a Hydra bug.
	 * Keeping test cases here in case its head pops up again
	 */
	if (0) {

		let u1 = this.mouseU;
		let v1 = this.mouseV;

		const {i: i2, j: j2} = view.screenUVtoPixelIJ(u1, v1, Config.angle);

		// visually verify pixel is correct
		frame.palette[65534] = 0xff0000ff;
		frame.pixels[j2 * frame.pixelWidth + i2] = 65534;

		const {u: u3, v: v3} = view.pixelIJtoScreenUV(i2, j2, Config.angle);
		console.log('a', u3 - u1, v3 - v1);

		let {dx: x4, dy: y4} = view.screenUVtoCoordDXY(u3, v3, Config.angle);
		x4 += Config.centerX;
		y4 += Config.centerY;

		let {i: i5, j: j5} = view.coordDXYtoPixelIJ(x4 - Config.centerX, y4 - Config.centerY);
		console.log('b', i5 - i2, j5 - j2);

		// visually verify pixel is correct
		frame.palette[65533] = 0xff00ff00;
		frame.pixels[j5 * frame.pixelWidth + i5] = 65533;

		let {dx: x6, dy: y6} = view.pixelIJtoCoordDXY(i5, j5);
		x6 += Config.centerX;
		y6 += Config.centerY;
		console.log('c', x6 - x4, y6 - y4);

		let {u: u7, v: v7} = view.coordDXYtoScreenUV(x6 - Config.centerX, y6 - Config.centerY, Config.angle);
		console.log('d', u7 - u3, v7 - v3);
		console.log('e', u7 - u1, v7 - v1);

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
	// Create a small key frame (mandatory)
	const keyView = new ZoomerView(64, 64, 64, 64); // Explicitly square

	// set all pixels of thumbnail with latest set `calculate`
	keyView.fill(Config.centerX, Config.centerY, Config.radius, Config.angle, this.zoomer, this.zoomer.onUpdatePixel);

	// if nothing moving, enable idling
	if (!Config.zoomSpeed && !this.mouseButtons && !Config.autoPilot && !Config.rotateSpeedNow && !Config.paletteSpeedNow)
		this.zoomer.timeLastWake = performance.now(); // safe to idle

	// inject into current view
	this.zoomer.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle, keyView);

	// slider value might have changed
	this.density.moveSliderTo(Config.densityNow);
};

/**
 * @param {ZoomerView} view
 * @param {number}   lookPixelRadius
 * @param {number}   borderPixelRadius
 * @returns {boolean}
 */
GUI.prototype.updateAutopilot = function (view, lookPixelRadius, borderPixelRadius) {

	const {pixelWidth, pixelHeight, viewWidth, viewHeight, pixels} = view;

	// use '>>1' as integer '/2'

	// Get view bounding box
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
	let {i: apI, j: apJ} = view.coordDXYtoPixelIJ(Config.autopilotX - view.centerX, Config.autopilotY - view.centerY);

	/*
	 * @date 2020-10-24 23:59:53
	 * Old code only focused to in/out set horizons.
	 * Add moving to areas of high contrast.
	 */

	/** @var {ZoomerFrame}
	    @description Bounding box center location */
	let bestI = 0;

	/** @var {ZoomerFrame}
	    @description Bounding box center location */
	let bestJ = 0;

	/** @var {ZoomerFrame}
	    @description Bounding box contains the highest `iter` */
	let bestIterHigh = 0; // highest iter found within bounding box

	/** @var {ZoomerFrame}
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
			let {dx, dy} = view.pixelIJtoCoordDXY(testI, testJ);

			// dampen sharp autopilot direction changes
			Config.autopilotX += (Config.centerX + dx - Config.autopilotX) * Config.autopilotCoef;
			Config.autopilotY += (Config.centerY + dy - Config.autopilotY) * Config.autopilotCoef;

			Config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_LEFT;

			// get screen location
			let {u, v} = view.pixelIJtoScreenUV(testI, testJ, Config.angle);

			// and position autopilot mark
			gui.domAutopilot.style.top = (v - borderPixelRadius) + "px";
			gui.domAutopilot.style.left = (u - borderPixelRadius) + "px";
			gui.domAutopilot.style.width = (borderPixelRadius * 2) + "px";
			gui.domAutopilot.style.height = (borderPixelRadius * 2) + "px";
			gui.domAutopilot.style.border = "4px solid green";
			return true;
		}
	}

	// go for high contrast
	// Something "hangs ". This needs extra working on.
	if (0 && bestIterHigh > iterLow * Config.autopilotContrast) {
		let {dx, dy} = view.pixelIJtoCoordDXY(bestI, bestJ);

		// dampen sharp autopilot direction changes
		Config.autopilotX += (Config.centerX + dx - Config.autopilotX) * Config.autopilotCoef;
		Config.autopilotY += (Config.centerY + dy - Config.autopilotY) * Config.autopilotCoef;

		Config.autopilotButtons = 1 << Aria.ButtonCode.BUTTON_LEFT;

		// get screen location
		let {u, v} = view.pixelIJtoScreenUV(bestI, bestJ, Config.angle);

		// and position autopilot mark
		gui.domAutopilot.style.top = (v - borderPixelRadius) + "px";
		gui.domAutopilot.style.left = (u - borderPixelRadius) + "px";
		gui.domAutopilot.style.width = (borderPixelRadius * 2) + "px";
		gui.domAutopilot.style.height = (borderPixelRadius * 2) + "px";
		gui.domAutopilot.style.border = "4px solid green";
		return true;
	}

	Config.autopilotButtons = 0;
	gui.domAutopilot.style.border = "4px solid red";
	return false;
};

GUI.prototype.autopilotOn = function () {

	const view = this.zoomer.calcView;
	Config.autopilotX = Config.centerX;
	Config.autopilotY = Config.centerY;

	const diameter = Math.min(view.pixelWidth, view.pixelHeight);
	let lookPixelRadius = Math.min(16, diameter >> 1);
	const borderPixelRadius = Math.min(16, diameter >> 5);
	do {
		if (!this.updateAutopilot(view, lookPixelRadius, borderPixelRadius))
			break;
		lookPixelRadius >>= 1;
	} while (lookPixelRadius > 2);
};

GUI.prototype.autopilotOff = function () {
	this.mouseButtons = 0;
	this.domAutopilot.style.border = "none";

};
