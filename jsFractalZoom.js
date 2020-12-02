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
	Config.rotate = true;
	Config.hiRes = (window.devicePixelRatio === 1);

	/** @member {float} - zoom speed */
	Config.zoomSpeedManual = 20;
	/** @member {float} - zoom speed */
	Config.zoomSpeedAuto = 2;
	/** @member {float} - zoom speed slider Min */
	Config.zoomSpeedMin = Math.log(1.1);
	/** @member {float} - zoom speed slider Max */
	Config.zoomSpeedMax = Math.log(25.0);
	/** @member {float} - zoom speed slider Now */
	Config.zoomSpeedNow = Math.log(Config.zoomSpeedManual);

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

	/** @member {float} - palette density */
	Config.density = 1; // actual value
	/** @member {float} - palette density slider Min */
	Config.densityMin = Math.log(0.0001);
	/** @member {float} - palette density slider Max */
	Config.densityMax = Math.log(1);
	/** @member {float} - palette density slider Now */
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
	/** @member {int} - Number of entries in palette[] for a complete cycle  */
	Config.paletteSize = 0;

	/** @member {int} - Palette theme  */
	Config.theme = Math.round(Math.random() * 8);

	/** @member {int} - Starting seed for palette  */
	Config.seed = Math.round(Math.random() * 2147483647);

	/** @member {float} - After 1sec, get 80% closer to target speed */
	Config.zoomAccelCoef = 0.80;

	/** @member {float} - screen U coordinate - autopilot updated */
	Config.autopilotU = 0;
	/** @member {float} - screen V coordinate - autopilot updated */
	Config.autopilotV = 0;
	/** @member {float} - Dampen sharp autopilot direction changed */
	Config.autopilotCoef = 0.3;
	/** @member {number} - HighestIter/LowestIter contrast threshold */
	Config.autopilotContrast = 5;

	/*
	 * @date 2020-11-18 01:24:53
	 * acceleration/deceleration of zoom/density:
	 *
	 * 	`GUI.zoomAccel` is the transition between stand-still and movement.
	 *		-1 FullSpeed reverse
	 * 		 0 Standstill
	 *		+1 Full speed ahead
	 * 	`Config.zoomAccelCoef` is the speed of the transition, implemented as low-pass filter.
	 * 		During timer updates, if a gesture is active it increased `zoomAccel` to reach +/-. Otherwise it decreases to reach 0.
	 * 	`Config.zoomSpeed(Auto/Manual)` is the maximum speed and ranges between `Config.zoomSpeedMin` and `Config.zoomSpeedMax`.
	 * 		It is updated by UI controls/gestures
	 *
	 * 	`zoomer.onBeginFrame()` combines `zoomAccel` and `zoomSpeed` to determine the actual speed and changes the motion vector accordingly
	 */
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
};

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
	Config.autopilotU = 0;
	Config.autopilotV = 0;

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

	/** @member {Uint32Array} - "Physical" palette scaled with `Config.density` to span 65535 entries */
	this.palette = new Uint32Array(65536);

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
		Config.paletteSize = nsegments * segmentsize;

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
			Config.paletteSize = Math.round(rcycle * gcycle * bcycle);
		} while (Config.paletteSize < 0xc000 || Config.paletteSize >= 0xffff);

		const t0 = this.random(10000) * 2 * Math.PI / 10000;
		for (let i = 0; i < Config.paletteSize; i++) {
			this.palette[i] =
				(128.0 + 127 * Math.sin(Math.PI * i / rcycle + t0)) << 0 | // Red
				(128.0 + 127 * Math.sin(Math.PI * i / gcycle + t0)) << 8 | // Green
				(128.0 + 127 * Math.sin(Math.PI * i / bcycle + t0)) << 16 | // Blue
				255 << 24; // Alpha
		}
	};

	this.randomize_segments5 = function (whitemode) {

		Config.paletteSize = 1000; // magic number so it looks good with density=1
		for (let i = 0; i < Config.paletteSize; i++) {
			const g = whitemode ? 255 - Math.round(i * 255 / Config.paletteSize) : Math.round(i * 255 / Config.paletteSize);

			this.palette[i] =
				g << 0 | // Red
				g << 8 | // Green
				g << 16 | // Blue
				255 << 24; // Alpha
		}
	};

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
	};

	/**
	 * Set palette
	 *
	 * @param {Uint32Array} out32  - frame.palette
	 * @param {int}         offset - Starting position for colour rotation
	 * @param {int}         maxIter - Starting position for colour rotation
	 */
	this.setPalette = function (out32, offset, maxIter) {

		const paletteSize = Config.paletteSize;

		// palette offset may not be negative
		if (offset < 0)
			offset = (paletteSize - 1) - (-offset - 1) % paletteSize;
		else
			offset = offset % paletteSize;

		/*
		 * @date 2020-11-07 00:27:00
		 *
		 * Assume paletteSize > densityNow
		 * Integer arithmetic to avoid slow floats
		 * offset is 16 bits, 0..65535
		 * scale by 15 bits to fit into 31 bits int.
		 *
		 * Following is to optimize `palette[Math.round(i * densityNow) % paletteSize];
		 */

		const stepK = Math.round(Config.density * 32768);
		const maxK = paletteSize * 32768;
		let k = offset * 32768;

		// copy palette and apply colour cycling
		const palette = this.palette;
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
	/**
	 *
	 * @param {string} id
	 * @returns {HTMLElement}
	 */
	function gebi(id) {
		return document.getElementById(id);
	}

	/*
	 * DOM elements and their matching id's
	 */
	this.domZoomer = gebi("idZoomer");
	this.domStatusTitle = gebi("idStatusTitle");
	this.domStatusPosition = gebi("idStatusPosition");
	this.domStatusLoad = gebi("idStatusLoad");
	this.domStatusRect = gebi("idStatusRect");
	this.domNavWrapper = gebi("idNavWrapper");
	this.domNav = gebi("idNav");
	this.domTop = gebi("idTop");
	this.domPowerButton = gebi("idPowerButton");
	this.domAutoPilotButton = gebi("idAutoPilotButton");
	this.domHomeButton = gebi("idHomeButton");
	this.domSaveButton = gebi("idSaveButton");
	this.domUrlButton = gebi("idUrlButton");
	this.domPopup = gebi("idPopup");
	this.domFormulaButton = gebi("idFormulaButton");
	this.domFormulaList = gebi("idFormulaList");
	this.domIncolourButton = gebi("idIncolourButton");
	this.domIncolourList = gebi("idIncolourList");
	this.domOutcolourButton = gebi("idOutcolourButton");
	this.domOutcolourList = gebi("idOutcolourList");
	this.domPlaneButton = gebi("idPlaneButton");
	this.domPlaneList = gebi("idPlaneList");
	this.domZoomSpeedLeft = gebi("idZoomSpeedLeft");
	this.domZoomSpeedRail = gebi("idZoomSpeedRail");
	this.domZoomSpeedThumb = gebi("idZoomSpeedThumb");
	this.domRotateButton = gebi("idRotateButton");
	this.domRotateLeft = gebi("idRotateLeft");
	this.domRotateRail = gebi("idRotateRail");
	this.domRotateThumb = gebi("idRotateThumb");
	this.domPaletteSpeedLeft = gebi("idPaletteSpeedLeft");
	this.domPaletteSpeedRail = gebi("idPaletteSpeedRail");
	this.domPaletteSpeedThumb = gebi("idPaletteSpeedThumb");
	this.domThemeButton = gebi("idThemeButton");
	this.domDensityLeft = gebi("idDensityLeft");
	this.domDensityRail = gebi("idDensityRail");
	this.domDensityThumb = gebi("idDensityThumb");
	this.domFramerateLeft = gebi("idFramerateLeft");
	this.domFramerateRail = gebi("idFramerateRail");
	this.domFramerateThumb = gebi("idFramerateThumb");
	this.domHiResButton = gebi("idHiResButton");
	this.domWxH = gebi("WxH");
	this.domPilot = gebi("idPilot");
	this.domResize = gebi("idResize");
	this.domFullscreen = gebi("idFullscreen");
	this.domMenu = gebi("idMenu");

	/**
	 * Pixel density.
	 * The CSS standard most giant fail: 1inch is always 96 dpi.
	 * How is this quirk fixed: `window.pixelDensity`, and even about that browsers sometimes lie.
	 *
	 * NOTE: scale all CSS pixel units to this, including events.
	 *
	 * @member {float} - Physical pixels per CSS pixel.
	 */
	this.devicePixelRatio = 1; // todo: make this user selectable: window.devicePixelRatio,

	/** @member {number} - view mouse X coordinate */
	this.mouseU = 0;
	this.mouseX = 0;
	/** @member {number} - view mouse Y coordinate */
	this.mouseV = 0;
	this.mouseY = 0;

	/** @member {boolean} - fractal coordinate of pointer when button first pressed */
	this.dragActive = false;
	/** @member {float} - fractal X coordinate of pointer */
	this.dragCenterX = 0;
	/** @member {float} - fractal Y coordinate of pointer */
	this.dragCenterY = 0;

	// per second differences
	this.lastNow = 0;
	this.directionalInterval = 100; // Interval timer for directional movement corrections

	// center popup sequence number so only last call to activate it will hide it
	this.popupSeqnr = 0;

	/*
	 * Construct UI components
	 */

	// construct sliders
	this.zoomSpeed = new Aria.Slider(this.domZoomSpeedThumb, this.domZoomSpeedRail,
		Config.zoomSpeedMin, Config.zoomSpeedMax, Config.zoomSpeedNow);
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
	this.formula.listbox.focusItem(gebi("formula_" + Formula.formula));
	this.incolour.listbox.focusItem(gebi("incolour_" + Formula.incolour));
	this.outcolour.listbox.focusItem(gebi("outcolour_" + Formula.outcolour));
	this.plane.listbox.focusItem(gebi("plane_" + Formula.plane));

	// enable if already at maximum
	if (window.devicePixelRatio === 1)
		this.domHiResButton.setAttribute("aria-pressed", "true");

	// construct buttons
	this.power = new Aria.Button(this.domPowerButton, false);
	this.autoPilot = new Aria.Button(this.domAutoPilotButton, false);
	this.home = new Aria.Button(this.domHomeButton, true);
	this.save = new Aria.Button(this.domSaveButton, true);
	this.url = new Aria.Button(this.domUrlButton, true);
	this.rotate = new Aria.Button(this.domRotateButton, false);
	this.theme = new Aria.Button(this.domThemeButton, true);
	this.hiRes = new Aria.Button(this.domHiResButton, false);

	/*
	 * It's easier to redraw the sliders than to hack "em" into them
	 */
	this.redrawSliders = () => {
		this.zoomSpeed.moveSliderTo(this.zoomSpeed.valueNow);
		this.rotateSpeed.moveSliderTo(this.rotateSpeed.valueNow);
		this.paletteSpeed.moveSliderTo(this.paletteSpeed.valueNow);
		this.density.moveSliderTo(this.density.valueNow);
		this.Framerate.moveSliderTo(this.Framerate.valueNow);
	};

	/** @member {float} - scaling of `idNav` within `idNavWrapper` */
	this.idNavScale = 1;
	/** @member {float} - scaling of `idNavWrapper` within `body` *. This is needed to scale mouse coordinates when resizing nav */
	this.idNavWrapScale = 1;
	/** @member {float} - height of top. 5 lines at 1.2em per line */
	this.topHeightEm = 6.0;
	/** @member {float} - height of `idNav`: 0.4 (topPadding) + 17*2 (rows) + 6@0.6em (isSmallText) + 0.4 (bottomPadding) */
	this.navHeightEm = 38.4;
	/** @member {float} - width of `idNav`. 24.5 (idNav.width) + 2*0.4 (padding) */
	this.navWidthEm = 25.3;

	/** @member {float} - current zoom (de-)acceleration. -1=maxReverse, 0=standStill, +1=maxForward */
	this.zoomAccel = 0;

	/** @member {int} - Maximum number of fingers on screen for touch gestures */
	this.touchActive = 0;
	/** @member {float} - Config.density at start of touch gesture (gesture is offset to this) */
	this.touchDensity0 = 0;
	/** @member {float} - Config.angle at start of touch gesture (gesture is offset to this) */
	this.touchAngle0 = 0;
	/** @member {float} - Angle at start of touch gesture */
	this.touchAngle = 0;
	/** @member {float} - Distance between two fingers at start of touch gesture */
	this.touchDistance = 0;

	/**
	 * @member {int}
	 * @property {int}  1 DRAG
	 * @property {int}  2 ZOOMIN
	 * @property {int}  3 ZOOMOUT
	 * @property {int}  4 ZOOMDRAG
	 * @property {int}  5 DENSITY
	 * @property {int}  6 DENSITYDRAG
	 * @description Active gesture */
	this.gesture = 0;

	const DRAG = 1; // wheel or 1-finger
	const ZOOMIN = 2; // mouse-left or stretch
	const ZOOMOUT = 3; // mouse-right or pinch
	const ZOOMDRAG = 4; // zoom continuation with remaining finger after zoom
	const DENSITY = 5; // stretch/pinch after 3rd finger
	const DENSITYDRAG = 6; // density continuation with remaining finger after zoom

	/** @member {number} - movement gesture - autopilot updated*/
	this.autopilotGesture = 0;

	/*
	 * Get position of (absolute) elements relative to page
	 */
	this.getRect = (el) => {
		let left = 0;
		let top = 0;
		let width = el.offsetWidth;
		let height = el.offsetHeight;
		while (el) {
			left += el.offsetLeft;
			top += el.offsetTop;
			el = el.offsetParent;
		}
		return {left: left, width: width, top: top, height: height};
	};

	/*
	 * Set fontsize
	 */
	this.setFontSize = () => {
		const viewWidth = document.body.clientWidth;
		const viewHeight = document.body.clientHeight;

		/*
		 * @date 2020-11-11 16:42:19
		 *
		 * `idTop` is full width and is 1/12th of clientHeight.
		 * It contains 5 lines of text (mixed font sizes), and with lineHeight of 1.2, totals to 6em high
		 * However, if screen is too narrow (the width is estimated 16em), reduce fontSize even more.
		 *
		 * `idTop` has a 1em top/right/left margin, and a 0.5em margin between `idNav`.
		 *
		 * `idNav` is spans upto 1em from `clientHeight`.
		 * `idResize` is used to scale accordingly.
		 *
		 * `idNav` contains a number of lines, set `fontSize` to scale contents to fit.
		 *
		 * set `body.fontSize` to scale `idTop`
		 * set `idNav.fontSize` to scale `idNav`
		 *
		 * status line is generally 150 characters long. Verdana has an aspect ratio of about 0.55, making it ~82em
		 * Extra space for left/right margin and room for the menu/expand buttons set it to ~95em
		 */

		/*
		 * determine body fontSize
		 */
		let topPxHeight = viewHeight / 10;
		let fontSize = topPxHeight / this.topHeightEm;

		if (viewWidth < fontSize * 95)
			fontSize *= viewWidth / (fontSize * 95); // scale down to fit

		// set fontsize of `body` so it scales `idTop`
		document.body.style.fontSize = fontSize + "px";

		/*
		 * determine `navWrapper` fontsize and position
		 */
		let navPxHeight = viewHeight - (1 + this.topHeightEm + 0.5 + 1) * fontSize;
		let navFontSize = navPxHeight / this.navHeightEm;
		this.idNavWrapScale = navFontSize;

		// scale down when portrait to fit width
		if (this.navWidthEm * navFontSize + 2 * fontSize > document.body.clientWidth)
			navFontSize = (document.body.clientWidth - 2 * fontSize) / this.navWidthEm;

		// in case the above was activated, remember the scale to adjust mouse coordinates on resize
		this.idNavWrapScale /= navFontSize;

		this.domNavWrapper.style.fontSize = (navFontSize / fontSize) + "em";
		this.domNavWrapper.style.top = ((1 + this.topHeightEm + 0.5) * fontSize / navFontSize) + "em";
		this.domNavWrapper.style.right = (1 * fontSize / navFontSize) + "em";

		/*
		 * Vertical align expand/shrink icon relative to top. Icons are 3em high
		 */

		let emTop = 1 + 6 + 0.5; // edgeMargin + idTop + separator
		this.domFullscreen.style.top = ((emTop - 3) / 2) + "em";
		this.domMenu.style.top = ((emTop - 3) / 2) + "em";

		this.redrawSliders();
	};


	/*
	 * Activate center popup contents was preloaded
	 */
	this.activatePopup = (innerText) => {
		const popup = this.domPopup;

		// set text
		popup.innerText = innerText;

		// show popup
		popup.className = "active";

		// get new sequence number
		const seqnr = ++this.popupSeqnr;

		// let event queue redraw
		setTimeout(() => {
			// only remove popup if sequence number matches
			if (seqnr === this.popupSeqnr)
				popup.className = "";
		}, 2000);
	};

	/**
	 * Size change detected for `domZoomer`
	 *
	 * @param {int}    viewWidth   - Screen width (pixels)
	 * @param {int}    viewHeight  - Screen height (pixels)
	 */
	this.resize = (viewWidth, viewHeight) => {
		/*
		 * set DOM size property
		 *
		 * @date 2020-11-16 00:32:31
		 * NOTE: this will erase the canvas contents
		 */
		this.domZoomer.width = viewWidth;
		this.domZoomer.height = viewHeight;

		// recalculate fontSize
		this.setFontSize();

		// update status line
		this.domWxH.innerHTML = "[" + viewWidth + "x" + viewHeight + "]";

		// show popup
		this.activatePopup(viewWidth + "x" + viewHeight);
	}

	/*
	 * @date 2020-10-15 13:08:13
	 * `desynchronized` dramatically speed enhances `putImageData()` but it might also glitch mouse movement when hovering over the canvas.
	 * `alpha` might have an effect, however not noticed yet.
	 */

	/** @member {CanvasRenderingContext2D} */
	this.ctx = this.domZoomer.getContext("2d", {desynchronized: true});

	// compensate broken CSS pixels by over-sampling the canvas
	let realClientWidth = Math.round(this.domZoomer.parentNode.clientWidth * this.devicePixelRatio);
	let realClientHeight = Math.round(this.domZoomer.parentNode.clientHeight * this.devicePixelRatio);
	// set canvas
	this.resize(realClientWidth, realClientHeight);

	/**
	 * Create the zoomer
	 *
	 * @member {Zoomer} - Zoomer instance
	 */
	this.zoomer = new Zoomer(this.domZoomer, (Config.angle !== 0), {

		/**
		 * Disable web-workers.
		 * Offload frame rendering to web-workers
		 *
		 * @member {boolean} - Frames per second
		 */
		disableWW: false,

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

			/*
			 * @date 2020-10-26 12:42:18
			 * Use the view angle as that is what you see when clicking. `Config.angle` lags behind.
			 */
			let {dx, dy} = zoomer.screenUVtoCoordDXY(this.mouseU, this.mouseV, Config.angle);
			this.mouseX = Config.centerX + dx;
			this.mouseY = Config.centerY + dy;

			if (this.zoomAccel) {
				// convert normalised zoom speed (-1<=speed<=+1) to magnification and scale to this time interval
				const magnify = Math.pow(Config.autoPilot ? Config.zoomSpeedAuto : Config.zoomSpeedManual, this.zoomAccel * diffSec);

				// zoom, The mouse pointer coordinate should not change
				Config.centerX = (Config.centerX - this.mouseX) / magnify + this.mouseX;
				Config.centerY = (Config.centerY - this.mouseY) / magnify + this.mouseY;
				Config.radius = Config.radius / magnify;

				// navigation change
				this.zoomer.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle);
			} else if (this.gesture) {
				// Gestures always sets navigation
				this.zoomer.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle);
			} else if (Config.rotateSpeedNow || Config.paletteSpeedNow) {
				// don't enter turbo if something passive is moving
				this.zoomer.turboActive = 0;
			}

			// maxIter for embedded calc(), maxDepth for formula.js
			this.domStatusTitle.innerHTML = JSON.stringify({
				x: Config.centerX, y: Config.centerY, radius: Config.radius, angle: Config.angle, density: Config.density, iter: Config.maxIter,
				quality: Math.round(dispFrame.quality * 100000) / 100000
			});
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
					drop: zoomer.cntDropped,
					lost: zoomer.cntLost,
				});

				this.lastNow = now;
			}

			/*
			 * Test for DOM resize now before starting next frame
			 */

			// compensate broken CSS pixels by over-sampling the canvas
			let realClientWidth = Math.round(this.domZoomer.parentNode.clientWidth * this.devicePixelRatio);
			let realClientHeight = Math.round(this.domZoomer.parentNode.clientHeight * this.devicePixelRatio);

			if (realClientWidth !== zoomer.viewWidth || realClientHeight !== zoomer.viewHeight) {
				// update views
				zoomer.resize(realClientWidth, realClientHeight, zoomer.enableAngle);
				// update canvas
				this.resize(zoomer.viewWidth, zoomer.viewHeight);
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
				density: Config.density,
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

	// set initial position. Do it now for UI control consistency (read: angle)
	this.zoomer.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle);

	/*
	 * callbacks and listeners
	 */

	// sliders
	this.zoomSpeed.setCallbackValueChange((newValue) => {

		Config.zoomSpeedNow = newValue;

		const zoomAccel = Math.round(Math.exp(newValue) * 10) / 10; // round

		if (Config.autoPilot)
			Config.zoomSpeedAuto = zoomAccel;
		else
			Config.zoomSpeedManual = zoomAccel;

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
			if (!this.zoomer.enableAngle && Config.rotate)
				this.zoomer.resize(this.zoomer.viewWidth, this.zoomer.viewHeight, true);
		} else if (this.zoomer.angle === 0) {
			// stopped and horizontal, disable
			if (this.zoomer.enableAngle)
				this.zoomer.resize(this.zoomer.viewWidth, this.zoomer.viewHeight, false);
		}

		// make zoomer responsive to change
		this.zoomer.turboActive = 0;
	});
	this.paletteSpeed.setCallbackValueChange((newValue) => {
		if (newValue > -1 && newValue < +1)
			newValue = 0; // snap to center
		Config.paletteSpeedNow = newValue;
		this.domPaletteSpeedLeft.innerHTML = newValue.toFixed(0);

		// make zoomer responsive to change
		this.zoomer.turboActive = 0;
	});
	this.density.setCallbackValueChange((newValue) => {
		Config.densityNow = newValue;
		Config.density = Math.exp(newValue);
		// round
		Config.density = Math.round(Config.density * 10000) / 10000;
		this.domDensityLeft.innerHTML = Config.density;

		// make zoomer responsive to change
		this.zoomer.turboActive = 0;
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
		 * `magnify = Math.pow(Config.zoomSpeedNow, this.zoomAccel * diffSec)`
		 */
		const magnify = Math.pow(Config.autoPilot ? Config.zoomSpeedAuto : Config.zoomSpeedManual, this.zoomAccel);

		Config.autoPilot = newValue;

		if (Config.autoPilot) {
			Config.zoomSpeedNow = Math.log(Config.zoomSpeedAuto);
			this.zoomAccel = Math.log(magnify) / Math.log(Config.zoomSpeedAuto);
			this.autopilotOn();
		} else {
			Config.zoomSpeedNow = Math.log(Config.zoomSpeedManual);
			this.zoomAccel = Math.log(magnify) / Math.log(Config.zoomSpeedManual);
			this.autopilotOff();
		}

		this.zoomSpeed.moveSliderTo(Config.zoomSpeedNow);
		this.zoomSpeed.updateLabels();
	});
	this.home.setCallbackValueChange((newValue) => {
		Config.home();
		this.reload();
	});
	this.save.setCallbackValueChange((newValue) => {
		/*
		 * Popup
		 */
		this.activatePopup("Saving...");

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
		const copyText = gebi("idCopyText");
		copyText.style.display = "block";
		copyText.value = location.origin + location.pathname + '?' + qstr;

		copyText.select();
		copyText.setSelectionRange(0, 99999);
		document.execCommand("copy");

		/*
		 * Popup
		 */
		this.activatePopup("Copied to clipboard");
	});
	this.rotate.setCallbackValueChange((newValue) => {
		/*
		 * Apply `window.pixelDensity` to CSS pixels
		 */
		Config.rotate = newValue;

		if (newValue) {
			// enable rotating
			if (!this.zoomer.enableAngle) {
				// set backend
				this.zoomer.resize(this.zoomer.viewWidth, this.zoomer.viewHeight, true);
				// restore angle
				this.zoomer.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle);
			}
		} else {
			// disable rotating
			if (this.zoomer.enableAngle) {
				// set backend
				this.zoomer.resize(this.zoomer.viewWidth, this.zoomer.viewHeight, false);
				// remove angle
				this.zoomer.setPosition(Config.centerX, Config.centerY, Config.radius, 0);
			}
		}

		// make zoomer responsive to change
		this.zoomer.turboActive = 0;

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
	this.hiRes.setCallbackValueChange((newValue) => {
		/*
		 * Apply `window.pixelDensity` to CSS pixels
		 */
		Config.hiRes = newValue;

		if (Config.hiRes) {
			this.devicePixelRatio = window.devicePixelRatio;
		} else {
			this.devicePixelRatio = 1;
		}

		// change will be detected on next `onEndFrame()`.
	});

	/*
	 *
	 */
	this.extractJson = (image) => {
		// create local canvas
		const canvas = document.createElement("canvas");
		canvas.width = image.width;
		canvas.height = image.height;
		const ctx = canvas.getContext("2d");

		// set background background colour
		ctx.strokeStyle = "#000";
		ctx.fillStyle = "#000";
		ctx.fillRect(0, 0, image.width, image.height);

		// draw image (with transparancy) on canvas
		ctx.drawImage(image, 0, 0, image.width, image.height);

		// get pixel data
		const rgba = new Uint32Array(ctx.getImageData(0, 0, image.width, image.height).data.buffer);

		// scan for json data
		let json = "";

		// skip first line and column
		let k = image.width + 1;
		const kmax = image.width * image.height;
		while (k < kmax) {
			let code = 0;
			for (let i = 0; i < 8; i++) {
				// pixel must not be transparent
				while (!(rgba[k] & 0xff000000)) {
					if (++k >= kmax)
						return null;
				}
				code |= (rgba[k++] & 1) << i;
			}

			if (code < 32 || code >= 128) {
				// invalid code
				json = "";
			} else if (json.length === 0) {
				if (code === 123 /* '{' */) {
					// sequence starter
					json = "{";
				}
			} else if (code === 125 /* '}' */) {
				// string complete
				json += '}';

				// test that it has a bit of body
				if (json.length > 16) {
					try {
						json = JSON.parse(json);
						return json;
					} catch (e) {
						return null;
					}
				}
			} else {
				// add character
				json += String.fromCharCode(code);
			}
		}

		// nothing found
		return null;
	};

	/**
	 * (re)load initial frame
	 */
	this.reload = () => {
		const zoomer = this.zoomer;

		// Create a small key frame (mandatory)
		const keyView = new ZoomerView(64, 64, 64, 64); // Explicitly square

		// set all pixels of thumbnail
		keyView.fill(Config.centerX, Config.centerY, Config.radius, Config.angle, zoomer, zoomer.onUpdatePixel);

		// inject into current view
		zoomer.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle, keyView);
	};

	this.autopilotOn = () => {

		const view = this.zoomer.calcView;
		Config.autopilotU = this.zoomer.viewWidth >> 1;
		Config.autopilotV = this.zoomer.viewHeight >> 1;
		// scale over-sampling
		Config.autopilotU *= this.devicePixelRatio;
		Config.autopilotV *= this.devicePixelRatio;

		this.domPilot.style.visibility = "visible";

		const diameter = Math.min(view.pixelWidth, view.pixelHeight);
		let lookPixelRadius = Math.min(16, diameter >> 1);
		const borderPixelRadius = Math.min(16, diameter >> 5);
		do {
			if (!this.updateAutopilot(view, lookPixelRadius, borderPixelRadius))
				break;
			lookPixelRadius >>= 1;
		} while (lookPixelRadius > 2);
	};

	this.autopilotOff = () => {
		this.gesture = 0;

		// remove pilot marker
		this.pilotOff();
	};

	this.showPilot = (u, v, colour) => {
		// scale over-sampling
		u /= this.devicePixelRatio;
		v /= this.devicePixelRatio;

		let borderPixelRadius = 4;

		this.domPilot.style.top = (v - borderPixelRadius) + "px";
		this.domPilot.style.left = (u - borderPixelRadius) + "px";
		this.domPilot.style.width = (borderPixelRadius * 2) + "px";
		this.domPilot.style.height = (borderPixelRadius * 2) + "px";
		this.domPilot.style.border = "4px solid " + colour;
		this.domPilot.style.visibility = "visible";
	};

	this.hidePilot = () => {
		this.domPilot.style.visibility = "hidden";
	};

	/**
	 * @param {ZoomerView} view
	 * @param {number}   lookPixelRadius
	 * @param {number}   borderPixelRadius
	 * @returns {boolean}
	 */
	this.updateAutopilot = (view, lookPixelRadius, borderPixelRadius) => {

		const {pixelWidth, pixelHeight, viewWidth, viewHeight, pixels} = view;
		const zoomer = this.zoomer;

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

		// scale over-sampling
		minI *= this.devicePixelRatio;
		minJ *= this.devicePixelRatio;
		maxI *= this.devicePixelRatio;
		maxJ *= this.devicePixelRatio;

		// `cnt`
		const minCnt = ((borderPixelRadius + 1) * (borderPixelRadius + 1)) >> 2;
		const maxCnt = minCnt * 3;

		// coordinate within pixel data pointed to by mouse
		let {i: apI, j: apJ} = zoomer.screenUVtoPixelIJ(Config.autopilotU, Config.autopilotV, Config.angle);

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

			// must be visible
			if (testI < minI || testJ < minJ || testI >= maxI || testJ >= maxJ)
				continue;

			let cnt = 0;
			for (let j = testJ - borderPixelRadius; j <= testJ + borderPixelRadius; j++) {
				for (let i = testI - borderPixelRadius; i <= testI + borderPixelRadius; i++) {
					const iter = pixels[j * pixelWidth + i];
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
				// get screen location
				let {u, v} = zoomer.pixelIJtoScreenUV(testI, testJ, Config.angle);

				// dampen sharp autopilot direction changes
				Config.autopilotU += Math.round((u - Config.autopilotU) * Config.autopilotCoef);
				Config.autopilotV += Math.round((v - Config.autopilotV) * Config.autopilotCoef);

				this.autopilotGesture = ZOOMIN;

				// and position autopilot mark
				this.showPilot(u, v, "green");
				return true;
			}
		}

		// go for high contrast
		// Something "hangs ". This needs extra working on.
		if (0 && bestIterHigh > iterLow * Config.autopilotContrast) {
			// get screen location
			let {u, v} = zoomer.pixelIJtoScreenUV(bestI, bestJ, Config.angle);

			// dampen sharp autopilot direction changes
			Config.autopilotU += Math.round((u - Config.autopilotU) * Config.autopilotCoef);
			Config.autopilotV += Math.round((v - Config.autopilotV) * Config.autopilotCoef);

			this.autopilotGesture = ZOOMIN;

			// and position autopilot mark
			this.showPilot(u, v, "green");
			return true;
		}

		this.autopilotGesture = 0;
		gui.domPilot.style.border = "4px solid red";
		return false;
	};

	/*
	 * Core handler for resizing `idNav`
	 */
	this.moveXY = (mouseX, mouseY) => {
		/*
		 * Calculate point on line that is closest to mouse
		 * line: y = (height / width) * x
		 */

		// compensate is `idNavWrapper was downscaled
		mouseX *= this.idNavWrapScale;
		mouseY *= this.idNavWrapScale;

		// determine point on line (allowed positions of the resizer)
		let a = -(this.navHeightEm / this.navWidthEm);
		let b = 1;
		let c = 0;
		let x = (b * (b * mouseX - a * mouseY) - a * c) / (a * a + b * b);
		let y = (a * (a * mouseY - b * mouseX) - b * c) / (a * a + b * b);

		// limits
		if (y > 1)
			this.idNavScale = 1;
		else if (y < 0.2)
			this.idNavScale = 0.2;
		else
			this.idNavScale = y;

		// set relative fontsize
		this.domNav.style.fontSize = this.idNavScale + "em";

		this.redrawSliders();

	};

	/*
	 * Register event listeners
	 */

	/*
	 * Touch handler for resizing `idNav`
	 */
	this.domResize.addEventListener("touchstart", (event0) => {
		event0.preventDefault();
		event0.stopPropagation();

		// where (percent-wise) in the parent element did the click occur
		const fontSize = parseInt(document.body.style.fontSize);
		const navRectTop = 7.5 * fontSize;
		const navRectRight = document.body.clientWidth - fontSize;
		const navRectBottom = document.body.clientHeight - fontSize;
		const navRectLeft = fontSize;

		const handleTouchMove = (event) => {
			event.preventDefault();
			event.stopPropagation();

			const touch = event.targetTouches[0];
			const mouseX = (navRectRight - touch.pageX) / (navRectBottom - navRectTop);
			const mouseY = (touch.pageY - navRectTop) / (navRectBottom - navRectTop);

			this.moveXY(mouseX, mouseY);
		};

		const handleTouchEnd = function (event) {
			event.preventDefault();
			event.stopPropagation();

			document.removeEventListener("touchmove", handleTouchMove);
			document.removeEventListener("touchend", handleTouchEnd);
			document.removeEventListener("touchcancel", handleTouchEnd);
		};

		// bind a mousemove event handler to move pointer
		document.addEventListener("touchmove", handleTouchMove);
		document.addEventListener("touchend", handleTouchEnd);
		document.addEventListener("touchcancel", handleTouchEnd);
	});

	this.domResize.addEventListener("mousedown", (event0) => {
		event0.preventDefault();
		event0.stopPropagation();

		// where (percent-wise) in the parent element did the click occur
		const fontSize = parseInt(document.body.style.fontSize);
		const navRectTop = 7.5 * fontSize;
		const navRectRight = document.body.clientWidth - fontSize;
		const navRectBottom = document.body.clientHeight - fontSize;
		const navRectLeft = fontSize;

		const mouseMove = (event) => {
			event.preventDefault();
			event.stopPropagation();

			const mouseX = (navRectRight - event.pageX) / (navRectBottom - navRectTop);
			const mouseY = (event.pageY - navRectTop) / (navRectBottom - navRectTop);

			this.moveXY(mouseX, mouseY);
		};
		const mouseUp = (event) => {
			event.preventDefault();
			event.stopPropagation();

			document.removeEventListener("mousemove", mouseMove);
			document.removeEventListener("mouseup", mouseUp);
		};

		document.addEventListener("mousemove", mouseMove);
		document.addEventListener("mouseup", mouseUp);
	});

	this.domFullscreen.addEventListener("mousedown", (event) => {
		event.preventDefault();
		event.stopPropagation();

		let currentState = this.domFullscreen.getAttribute("aria-pressed");

		if (currentState === "true") {
			currentState = "false";

			// exit fullscreen
			if (document.exitFullscreen)
				document.exitFullscreen();
			else if (document.webkitExitFullscreen) /* Safari */
				document.webkitExitFullscreen();
			else if (document.msExitFullscreen) /* IE11 */
				document.msExitFullscreen();
			else
				return;
		} else {
			currentState = "true";

			// enter fullscreen
			let elem = document.documentElement;

			if (elem.requestFullscreen)
				elem.requestFullscreen();
			else if (elem.webkitRequestFullscreen) /* Safari */
				elem.webkitRequestFullscreen();
			else if (elem.msRequestFullscreen) /* IE11 */
				elem.msRequestFullscreen();
			else return;
		}

		this.domFullscreen.setAttribute("aria-pressed", currentState);
	});

	this.domMenu.addEventListener("mousedown", (event) => {
		event.preventDefault();

		let currentState = this.domMenu.getAttribute("aria-pressed");

		if (currentState === "true") {
			currentState = "false";

			this.domTop.style.visibility = "hidden";
			this.domNav.style.visibility = "hidden";
			this.domTop.style.pointerEvents = "none";
			this.domNav.style.pointerEvents = "none";
		} else {
			currentState = "true";

			this.domTop.style.visibility = "visible";
			this.domNav.style.visibility = "visible";
			this.domTop.style.pointerEvents = "auto";
			this.domNav.style.pointerEvents = "auto";

			// now sliders are visible, set their positions
			this.redrawSliders();
		}

		this.domMenu.setAttribute("aria-pressed", currentState);
	});

	/*
	 * If a touchstart reaches navPane, then the touch missed the target, find nearest and delegate
	 */
	this.domNav.addEventListener("touchstart", (event) => {
		// touch event target
		const touchEvent = event.targetTouches[0];
		if (!touchEvent)
			return; // no event;

		// list of targets as there is no `getEventListeners()`
		const targets = [
			this.domPowerButton,
			this.domAutoPilotButton,
			this.domHomeButton,
			this.domSaveButton,
			this.domUrlButton,
			this.domFormulaButton,
			this.domIncolourButton,
			this.domOutcolourButton,
			this.domPlaneButton,
			this.domZoomSpeedThumb,
			this.domRotateThumb,
			this.domDensityThumb,
			this.domPaletteSpeedThumb,
			this.domThemeButton,
			this.domFramerateThumb];

		// get rectangle within page
		const navRect = this.getRect(this.domNav);

		// which target is closest.
		// NOTE: `domResize` is an SVG and apparently has no `offsetLeft/Top`. Use lower/left `idNav`.
		let bestElem = this.domResize;
		let bestDistX = touchEvent.pageX - navRect.left;
		let bestDistY = touchEvent.pageY - (navRect.top + navRect.height);

		for (let t = 0; t < targets.length; t++) {
			const target = targets[t];
			const rect = this.getRect(target);

			// get target center
			const tX = touchEvent.pageX - (rect.left + rect.width / 2);
			const tY = touchEvent.pageY - (rect.top + rect.height / 2);
			if (tX * tX + tY * tY < bestDistX * bestDistX + bestDistY * bestDistY) {
				bestElem = target;
				bestDistX = tX;
				bestDistY = tY;
			}
		}

		/*
		 * Taking the size of the menu/expand as reference (1/20th of width/height)
		 * Forward is distance to target is about the size of those icons.
		 */
		const maxDist = Math.min(document.body.clientWidth, document.body.clientHeight) / 20;

		if (bestDistX * bestDistX + bestDistY * bestDistY > 2 * maxDist * maxDist)
			return; // out of range

		// forward event
		bestElem.dispatchEvent(new event.constructor(event.type, event));
	});

	/*
	 * Handle focus event
	 */
	this.domZoomer.addEventListener("focus", (event) => {
		this.domZoomer.classList.add("focus");
	});

	/*
	 * Handle blur event
	 */
	this.domZoomer.addEventListener("blur", (event) => {
		this.domZoomer.classList.remove("focus");
	});

	/*
	 * Pressing keys
	 */
	document.addEventListener("keydown", (event) => {
		// ignore ctrl/alt keys
		if (event.altKey || event.ctrlKey || event.metaKey)
			return;

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
		case "H":
		case "h":
			this.home.buttonDown();
			this.domHomeButton.focus();
			break;
		case "I":
		case "i":
			if (!this.incolour.toggleListbox(event))
				this.domZoomer.focus();
			break;
		case "M":
		case "m":
			this.domMenu.dispatchEvent(new MouseEvent("mousedown"));
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
			this.zoomSpeed.moveSliderTo(this.zoomSpeed.valueNow + Math.log(1.05)); // raise 5%
			this.domZoomSpeedThumb.focus();
			break;
		case "z":
			this.zoomSpeed.moveSliderTo(this.zoomSpeed.valueNow - Math.log(1.05)); // lower 5%
			this.domZoomSpeedThumb.focus();
			break;
		default:
			return;
		}

		event.preventDefault();
		event.stopPropagation();

	});

	/**
	 * Releasing keys
	 *
	 * @param {KeyboardEvent} event
	 */
	document.addEventListener("keyup", (event) => {
		// ignore ctrl/alt keys
		if (event.altKey || event.ctrlKey || event.metaKey)
			return;

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
		case "H":
		case "h":
			this.home.buttonUp();
			this.domZoomer.focus();
			break;
		case "M":
		case "m":
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
		default:
			return;
		}

		event.preventDefault();
		event.stopPropagation();
	});

	/*
	 * Turning wheel
	 */
	document.addEventListener("wheel", (event) => {
		/*
		 * Node: the slider has logarithmic values. "Times N" is "add log(N)"
		 *
		 * @date 2020-11-08 01:50:53
		 * Chrome does WheelEvent.DOM_DELTA_PIXEL with +/- 150
		 * Firefox does WheelEvent.DOM_DELTA_LINE with +/- 3
		 *
		 * Do simple, and move slide 1 position per event
		 */

		let newValue = 1;
		let delta = event.deltaY;
		if (delta >= 1) {
			newValue = Config.densityNow + Math.log(1.05);
			if (newValue > Config.densityMax)
				newValue = Config.densityMax;
		}
		if (delta <= -1) {
			newValue = Config.densityNow - Math.log(1.05);
			if (newValue < Config.densityMin)
				newValue = Config.densityMin;
		}

		Config.densityNow = newValue;
		Config.density = Math.exp(newValue);
		Config.density = Math.round(Config.density * 10000) / 10000; // round

		this.density.moveSliderTo(Config.densityNow);
	});

	/*
	 * Dropping files
	 */
	document.addEventListener("dragover", (event) => {
		// Prevent default behavior (Prevent file from being opened)
		event.preventDefault();
	});
	document.addEventListener("drop", (event) => {
		event.preventDefault();

		// get dropped file
		const file = event.dataTransfer.files[0];
		if (!file)
			return; // not a file drop event

		// Create reader.
		const reader = new FileReader();
		reader.onload = () => {
			const image = new Image();

			image.onload = () => {
				const json = this.extractJson(image);
				if (!json) {
					// image does not contain json
					this.activatePopup("Image does not contain navigation data");
				} else {
					// convert json to query string
					let qarr = [];
					for (let k in json) {
						qarr.push(k + '=' + json[k]);
					}
					let qstr = qarr.join("&");

					// load config
					Config.load(qstr);
					palette.loadTheme();

					// activate
					this.reload();
				}
			};
			image.onerror = () => {
				this.activatePopup("Failed to decode file");
			};

			image.src = reader.result;
		};
		reader.onabort = () => {
			this.activatePopup("Drop canceled");
		};
		reader.onerror = () => {
			this.activatePopup("Drop error");
		};

		reader.readAsDataURL(file);
	});

	/**
	 * Mouse moving over the screen
	 *
	 * @param {MouseEvent} event
	 */
	this.handleMouse = (event) => {

		event.preventDefault();
		event.stopPropagation();

		const zoomer = this.zoomer;
		const rect = this.domZoomer.getBoundingClientRect();

		/*
		 * On first button press set a document listener to catch releases outside target element
		 */
		if (this.gesture === 0 && event.buttons !== 0) {
			// on first button press set release listeners
			document.addEventListener("mousemove", this.handleMouse);
			document.addEventListener("mouseup", this.handleMouse);
			document.addEventListener("contextmenu", this.handleMouse);
		}

		// determine mouse screen position
		this.mouseU = event.pageX - rect.left;
		this.mouseV = event.pageY - rect.top;
		// scale over-sampling
		this.mouseU *= this.devicePixelRatio;
		this.mouseV *= this.devicePixelRatio;

		/*
		 * Encountered a Hydra bug.
		 * Keeping test cases here in case its head pops up again
		 */
		if (0) {

			let u1 = this.mouseU;
			let v1 = this.mouseV;

			const {i: i2, j: j2} = zoomer.screenUVtoPixelIJ(u1, v1, Config.angle);

			// visually verify pixel is correct
			frame.palette[65534] = 0xff0000ff;
			frame.pixels[j2 * frame.pixelWidth + i2] = 65534;

			const {u: u3, v: v3} = zoomer.pixelIJtoScreenUV(i2, j2, Config.angle);
			console.log('a', u3 - u1, v3 - v1);

			let {dx: x4, dy: y4} = zoomer.screenUVtoCoordDXY(u3, v3, Config.angle);
			x4 += Config.centerX;
			y4 += Config.centerY;

			let {i: i5, j: j5} = zoomer.coordDXYtoPixelIJ(x4 - Config.centerX, y4 - Config.centerY);
			console.log('b', i5 - i2, j5 - j2);

			// visually verify pixel is correct
			frame.palette[65533] = 0xff00ff00;
			frame.pixels[j5 * frame.pixelWidth + i5] = 65533;

			let {dx: x6, dy: y6} = zoomer.pixelIJtoCoordDXY(i5, j5);
			x6 += Config.centerX;
			y6 += Config.centerY;
			console.log('c', x6 - x4, y6 - y4);

			let {u: u7, v: v7} = zoomer.coordDXYtoScreenUV(x6 - Config.centerX, y6 - Config.centerY, Config.angle);
			console.log('d', u7 - u3, v7 - v3);
			console.log('e', u7 - u1, v7 - v1);

		}

		if (event.buttons & (1 << Aria.ButtonCode.BUTTON_LEFT))
			this.gesture = ZOOMIN;
		else if (event.buttons & (1 << Aria.ButtonCode.BUTTON_RIGHT))
			this.gesture = ZOOMOUT;
		else if (event.buttons & (1 << Aria.ButtonCode.BUTTON_WHEEL))
			this.gesture = DRAG;
		else
			this.gesture = 0;

		if (event.buttons === 0) {
			// remove listeners when last button released
			document.removeEventListener("mousemove", this.handleMouse);
			document.removeEventListener("mouseup", this.handleMouse);
			document.removeEventListener("contextmenu", this.handleMouse);
		}
	};

	this.domZoomer.addEventListener("mousedown", this.handleMouse);
	this.domZoomer.addEventListener("contextmenu", this.handleMouse);

	/*
	 * Fingers moving over the screen
	 */
	this.handleTouch = (event) => {
		event.preventDefault();
		event.stopPropagation();

		/*
		 * States:
		 *    Gesture    #fingers   Add finger   Release finger   Description
		 * ------------+----------+------------+----------------+------------
		 * NONE        |     0    |   DRAG     |      NONE      | No contact
		 * DRAG        |     1    |   ZOOM     |      NONE      | Wheel or 1-finger
		 * ZOOM        |     2    | DENSITY(3) |    ZOOMDRAG    | Mouse-left/right or stretch/pinch
		 * ZOOMDRAG    |     1    |   ZOOM     |      NONE      | Zoom continuation with remaining finger after zoom
		 * DENSITY     |     3    | DENSITY(3) |  DENSITYDRAG   | Stretch/pinch with 3rd finger
		 * DENSITY     |     2    | DENSITY(3) |  DENSITYDRAG   | Stretch/pinch after releasing 3rd finger
		 * DENSITYDRAG |     1    | DENSITY(2) |      NONE      | Density continuation with remaining finger after zoom
		 */
		const debugTouch = false;

		if (event.touches.length >= 2) {

			// get zoomer rectangle (might have a margin)
			const touchA = event.touches[0];
			const touchB = event.touches[1];
			const zoomerRect = this.getRect(this.domZoomer);

			// simulate a drag gesture
			const touchAu = touchA.pageX - zoomerRect.left;
			const touchAv = touchA.pageY - zoomerRect.top;
			const touchBu = touchB.pageX - zoomerRect.left;
			const touchBv = touchB.pageY - zoomerRect.top;
			const du = touchBu - touchAu; // atan2 left to right
			const dv = touchAv - touchBv; // atan2 bottom to top

			// get angle and distance
			let touchAngle = Math.atan2(du, dv) * 180 / Math.PI + 180;
			let touchDistance = Math.sqrt(du * du + dv * dv);

			if (touchDistance === 0)
				return; // don't divide by zero

			// Direction is midpoint between touch points
			this.mouseU = (touchAu + touchBu) >> 1;
			this.mouseV = (touchAv + touchBv) >> 1;
			// scale over-sampling
			this.mouseU *= this.devicePixelRatio;
			this.mouseV *= this.devicePixelRatio;

			/*
			 * Gesture states
			 */
			if (event.touches.length > 2 && (this.gesture === ZOOMIN || this.gesture === ZOOMOUT)) {
				// ZOOM -> DENSITY3

				if (debugTouch) this.activatePopup("ZOOM->DENSITY3");

				// update initial distance
				this.touchDensity0 = Config.density;
				this.touchAngle0 = Config.angle;
				this.touchAngle = touchAngle;
				this.touchDistance = touchDistance;
				this.touchActive = true;

				this.gesture = DENSITY;

			} else if (this.gesture === DENSITYDRAG) {
				// DENSITY(DRAG)->DENSITY2

				if (debugTouch && this.gesture === DENSITYDRAG) this.activatePopup("DENSITYDRAG->DENSITY2");

				// update initial distance
				this.touchDensity0 = Config.density;
				this.touchAngle0 = Config.angle;
				this.touchAngle = touchAngle;
				this.touchDistance = touchDistance;
				this.touchActive = true;

				this.gesture = DENSITY;

			} else if (this.gesture === DENSITY) {
				// DENSITY -> DENSITY

				if (this.touchDistance === 0)
					return; // don't divide by zero

				// determine difference with initial finger distance
				let ratio = touchDistance / this.touchDistance;

				// dampen effect of ratio
				ratio = Math.exp(Math.log(ratio) * 0.75);

				Config.density = this.touchDensity0 * ratio;

				// NOTE: slider is exponential
				this.density.moveSliderTo(Math.log(Config.density));

				this.activatePopup(Config.density);

			} else if (this.gesture === DRAG || this.gesture === ZOOMDRAG || this.gesture === ZOOMIN || this.gesture === ZOOMOUT) {
				// (ZOOM)DRAG->ZOOM

				if (debugTouch && this.gesture === DRAG) this.activatePopup("DRAG->ZOOM");
				if (debugTouch && this.gesture === ZOOMDRAG) this.activatePopup("ZOOMDRAG->ZOOM");

				// save initial angle and distance
				if (!this.touchActive) {
					this.touchDensity0 = Config.density;
					this.touchAngle0 = Config.angle;
					this.touchAngle = touchAngle;
					this.touchDistance = touchDistance;
					this.touchActive = true;
				}

				// determine difference with initial
				touchAngle -= this.touchAngle;
				touchDistance /= this.touchDistance;
				const a0 = touchAngle;
				while (touchAngle > 180)
					touchAngle -= 360;
				while (touchAngle < -180)
					touchAngle += 360;

				/*
				 * set angle
				 */
				Config.angle = this.touchAngle0 + touchAngle;

				// enable rotation
				if (!this.zoomer.enableAngle && Config.rotate)
					this.zoomer.resize(this.zoomer.viewWidth, this.zoomer.viewHeight, true);

				/*
				 * Set zoom speed.
				 * this.zoomAccel is -1..+1, set by the interval timer, i=used for speedup/slowdown
				 * Config.zoomSpeedManual is zoom speed, set by `onBeginFrame()`
				 */

				if (touchDistance > 1) {
					Config.zoomSpeedManual = 3 * touchDistance;
					this.gesture = ZOOMIN;
				} else {
					Config.zoomSpeedManual = 3 * (1 / touchDistance);
					this.gesture = ZOOMOUT;
				}

				// save a copy for when dropping to drag
				this.touchU = this.mouseU;
				this.touchV = this.mouseV;
				this.touchAbs = true;

				// and position autopilot mark
				this.showPilot(this.mouseU, this.mouseV, "green");

				// make speedup/slowdown more responsive
				// todo: hardcoded, awaiting a more configurable solution
				Config.zoomAccelCoef = 0.95;

				// make zoomer responsive to change
				this.zoomer.turboActive = 0;
			}

		} else if (event.touches.length === 1) {

			// get zoomer rectangle (might have a margin)
			const touchEvent = event.touches[0];
			const zoomerRect = this.getRect(this.domZoomer);
			this.mouseU = touchEvent.pageX - zoomerRect.left;
			this.mouseV = touchEvent.pageY - zoomerRect.top;
			// scale over-sampling
			this.mouseU *= this.devicePixelRatio;
			this.mouseV *= this.devicePixelRatio;

			/*
			/*
			 * Gesture states
			 */
			if (this.gesture === 0 || this.gesture === DRAG) {
				// NONE/DRAG -> DRAG

				if (debugTouch && this.gesture === 0) this.activatePopup("NONE->DRAG");

				this.gesture = DRAG;

			} else if (this.gesture === ZOOMIN || this.gesture === ZOOMOUT || this.gesture === ZOOMDRAG) {
				// ZOOM(DRAG) -> ZOOMDRAG

				if (debugTouch && this.gesture !== ZOOMDRAG) this.activatePopup("ZOOM->ZOOMDRAG");

				this.gesture = ZOOMDRAG;

				// convert touchUV to relative coordinates (vector to last marker)
				if (this.touchAbs) {
					this.touchU = this.touchU - this.mouseU;
					this.touchV = this.touchV - this.mouseV;
					this.touchAbs = false;
				}

				// add pilot marker relative vector
				this.mouseU += this.touchU;
				this.mouseV += this.touchV;

				// position marker
				this.showPilot(this.mouseU, this.mouseV, "green");

			} else if (this.gesture === DENSITY) {
				// DENSITY -> DENSITYDRAG

				if (debugTouch && this.gesture !== DENSITYDRAG) this.activatePopup("DENSITY->DENSITYDRAG");

				this.gesture = DENSITYDRAG;

			} else if (this.gesture === DENSITYDRAG) {
				// DENSITYDRAG -> DENSITYDRAG

			}

		} else if (event.touches.length === 0) {
			// screen released

			this.gesture = 0;
			this.touchActive = false;
			this.hidePilot();
		}
	};

	this.domZoomer.addEventListener("touchstart", this.handleTouch);
	this.domZoomer.addEventListener("touchmove", this.handleTouch);
	this.domZoomer.addEventListener("touchend", this.handleTouch);

	/*
	 * Constructor
	 */
	{
		// Create a small key frame (mandatory)
		const keyView = new ZoomerView(64, 64, 64, 64); // Explicitly square

		// Calculate all the pixels, or choose any other content (optional)
		keyView.fill(Config.centerX, Config.centerY, Config.radius, Config.angle, this.zoomer, this.zoomer.onUpdatePixel);

		// set initial position and inject key frame (mandatory)
		this.zoomer.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle, keyView);

		// snap to actual dimensions
		this.setFontSize();

		setInterval(() => {
			// seconds since last cycle
			const now = performance.now();
			const diffSec = this.directionalInterval / 1000;
			const calcView = this.zoomer.calcView;

			if (Config.autoPilot) {
				if (calcView.reachedLimits()) {
					this.autopilotGesture = ZOOMOUT;
					gui.domPilot.style.border = "4px solid orange";
				} else {
					this.domStatusPosition.innerHTML = "";

					if (!this.updateAutopilot(calcView, 4, 16))
						if (!this.updateAutopilot(calcView, 60, 16))
							if (!this.updateAutopilot(calcView, Math.min(calcView.pixelWidth, calcView.pixelHeight) >> 1, 16))
								this.autopilotGesture = ZOOMOUT;
				}

				this.mouseU = Config.autopilotU;
				this.mouseV = Config.autopilotV;
				this.gesture = this.autopilotGesture;
			}

			/*
			 * Update zoom (de-)acceleration. -1=maxReverse, 0=standStill, +1=maxForward
			 */
			if (this.gesture === ZOOMIN) {
				// zoom-in
				this.zoomAccel = +1 - (+1 - this.zoomAccel) * Math.pow((1 - Config.zoomAccelCoef), diffSec);
			} else if (this.gesture === ZOOMOUT) {
				// zoom-out
				this.zoomAccel = -1 - (-1 - this.zoomAccel) * Math.pow((1 - Config.zoomAccelCoef), diffSec);
			} else if (this.gesture !== DRAG && this.gesture !== ZOOMDRAG) {
				// buttons released
				this.zoomAccel = this.zoomAccel * Math.pow((1 - Config.zoomAccelCoef), diffSec);

				if (this.zoomAccel >= -0.001 && this.zoomAccel < +0.001)
					this.zoomAccel = 0; // full stop
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
				if (Config.angle < -180)
					Config.angle += 360;
				else if (Config.angle > 180)
					Config.angle -= 360;

				// round
				Config.angle = Math.round(Config.angle * 100) / 100;

				// navigation/angle change
				this.zoomer.setPosition(Config.centerX, Config.centerY, Config.radius, Config.angle);
			}

			// drag gesture
			if (this.gesture === DRAG) {
				// need screen coordinates to avoid drifting
				const dispView = this.zoomer.dispView;
				const {dx, dy} = this.zoomer.screenUVtoCoordDXY(this.mouseU, this.mouseV, Config.angle);

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
				this.showPilot((this.zoomer.viewWidth >> 1), (this.zoomer.viewHeight >> 1), "orange");

			} else if (this.dragActive) {
				this.dragActive = false;
				this.hidePilot();
			}

		}, this.directionalInterval);
	}
}
