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
	this.power = true;
	this.autoPilot = false;

	/** @member {number} - zoom magnification slider Min */
	this.magnificationMin = 1.0;
	/** @member {number} - zoom magnification slider Max */
	this.magnificationMax = 4.0;
	/** @member {number} - zoom magnification slider Now */
	this.magnificationNow = this.logTolinear(this.magnificationMin, this.magnificationMax, 1.5);

	/** @member {number} - rotate speed slider Min */
	this.rotateSpeedMin = -1.0;
	/** @member {number} - rotate speed slider Max */
	this.rotateSpeedMax = +1.0;
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
	this.depthMax = 2000;
	/** @member {number} - calculation depth slider Now */
	this.depthNow = 350;

	/** @member {number} - calculation depth slider Min */
	this.framerateMin = 4;
	/** @member {number} - calculation depth slider Max */
	this.framerateMax = 60;
	/** @member {number} - calculation depth slider Now */
	this.framerateNow = 20;

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

/**
 * Viewport to the fractal world.
 * The actual pixel area is square and the viewport is a smaller rectangle that can rotate fully within
 *
 * Coordinate system is the center x,y and radius.
 * 
 * @constructor
 * @param width
 * @param height
 */
function Viewport(width, height) {

	// don't go zero
	if (width <= 0)
		width = 1;
	if (height <= 0)
		height = 1;

	/** @member {number} - tick of last update */
	this.tickLast = 0;

	/** @member {Uint8Array} - temporary red palette after rotating palette index */
	this.tmpRed = new Uint8Array(256);
	/** @member {Uint8Array} - temporary red palette after rotating palette index */
	this.tmpGreen = new Uint8Array(256);
	/** @member {Uint8Array} - temporary red palette after rotating palette index */
	this.tmpBlue = new Uint8Array(256);

	/** @member {number} - width of viewport */
	this.viewWidth = width;
	/** @member {number} - height of viewport */
	this.viewHeight = height;
	/** @member {number} - diameter of the pixel data */
	this.diameter = Math.ceil(Math.sqrt(this.viewWidth * this.viewWidth + this.viewHeight * this.viewHeight));
	/** @member {Uint8Array} - pixel data (must be square) */
	this.pixels = new Uint8Array(this.diameter * this.diameter);

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

	/** @member {number} - sin(angle) */
	this.rsin = Math.sin(this.angle * Math.PI / 180);
	/** @member {number} - cos(angle) */
	this.rcos = Math.cos(this.angle * Math.PI / 180);

	this.lastTick = 0;
	this.dragActive = false;
	this.dragActiveX = 0;
	this.dragActiveY = 0;
	this.initY = 0;

	this.setPosition(-0.75, 0, 2.5);
}

/**
 * Set the center coordinate and radius.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 */
Viewport.prototype.setPosition = function(x, y, radius) {
	this.centerX = x;
	this.centerY = y;
	this.radius = radius;

	var d = Math.sqrt(this.viewWidth * this.viewWidth + this.viewHeight * this.viewHeight);
	this.radiusX = radius * this.viewWidth / d;
	this.radiusY = radius * this.viewHeight / d;

	// window.gui.domStatusQuality.innerHTML = JSON.stringify({x:x, y:y, r:radius});
};

/**
 * Extract rotated viewport from pixels and store them in specified imnagedata
 * The pixel data is palette based, the imagedata is RGB
 *
 * @param {number} angle
 * @param {Uint8ClampedArray} paletteRed
 * @param {Uint8ClampedArray} paletteGreen
 * @param {Uint8ClampedArray} paletteBlue
 * @param {Uint8ClampedArray} imagedata
 */
Viewport.prototype.paint = function(angle, paletteRed, paletteGreen, paletteBlue, imagedata) {

	// make references local
	var paletteSize = paletteRed.length;
	var tmpRed = this.tmpRed;
	var tmpGreen = this.tmpGreen;
	var tmpBlue = this.tmpBlue;
	var viewWidth = this.viewWidth; // viewport width
	var viewHeight = this.viewHeight; // viewport height
	var pixels = this.pixels; // pixel data
	var diameter = this.diameter; // pixel scanline width (it's square)
	var rgba = imagedata.data; // canvas pixel data
	var i, j, x, y, ix, iy, ji, yx, c;

	// set angle
	this.rsin = Math.sin(angle * Math.PI / 180);
	this.rcos = Math.cos(angle * Math.PI / 180);

	// palette offset must be integer and may not be negative
	var offset = Math.round(window.config.paletteOffset);
	if (offset < 0)
		offset = (paletteSize-1) - (1-offset) % (paletteSize-1);
	else
		offset = offset % (paletteSize-1);

	// apply colour cycling (not for first colour)
	tmpRed[0] = paletteRed[0];
	tmpGreen[0] = paletteGreen[0];
	tmpBlue[0] = paletteBlue[0];
	for (i = 1; i < paletteSize; i++) {
		tmpRed[i] = paletteRed[(i + offset) % (paletteSize - 1) + 1];
		tmpGreen[i] = paletteGreen[(i + offset) % (paletteSize - 1) + 1];
		tmpBlue[i] = paletteBlue[(i + offset) % (paletteSize - 1) + 1];
	}

	var xstart, ystart;
	if (this.angle === 0) {
		// extract viewport
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
		// viewport rotation
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
 * Handle mouse movement.
 * Left button - zoom in
 * Center button - drag
 * Right button - zoom out
 *
 * @param {number} tickNow
 * @param {number} mouseX
 * @param {number} mouseY
 * @param {number} buttons - OR-ed set of Aria.ButtonCode
 */
Viewport.prototype.handleChange = function(tickNow, mouseX, mouseY, buttons) {

	/** @type {Config} */
	var config = window.config;

	if (this.tickLast === 0) {
		// sync only
		this.tickLast = tickNow;
		return;
	}

	// seconds since last call
	var diffSec = (tickNow - this.tickLast) / 1000;

	/*
	 * Update palette cycle offset
	 */
	if (config.paletteSpeedNow)
		config.paletteOffset += diffSec * config.paletteSpeedNow;

	/*
	 * Update viewport angle
	 */
	if (config.rotateSpeedNow)
		config.angle += diffSec * config.rotateSpeedNow * 360;

	/*
	 * Update zoom (de-)acceleration. -1 <= zoomSpeed <= +1
	 */
	if (buttons === (1 << Aria.ButtonCode.BUTTON_LEFT)) {
		// zoom-in only
		config.zoomSpeed = +1 - (+1 - config.zoomSpeed) * Math.pow((1 - config.zoomSpeedCoef), diffSec);
	} else if (buttons === (1 << Aria.ButtonCode.BUTTON_RIGHT)) {
		// zoom-out only
		config.zoomSpeed = -1 - (-1 - config.zoomSpeed) * Math.pow((1 - config.zoomSpeedCoef), diffSec);
	} else if (buttons === 0) {
		// buttons released
		config.zoomSpeed = config.zoomSpeed * Math.pow((1 - config.zoomSpeedCoef), diffSec);

		if (config.zoomSpeed >= -0.001 && config.zoomSpeed < +0.001)
			config.zoomSpeed = 0; // full stop
	}

	/*
	 *translate mouse to fractal coordinate
	 */
	// relative to viewport center
	var dx = mouseX * this.radiusX * 2 / this.viewWidth - this.radiusX;
	var dy = mouseY * this.radiusY * 2 / this.viewHeight - this.radiusY;
	// undo rotation
	var x = dy * this.rsin + dx * this.rcos + this.centerX;
	var y = dy * this.rcos - dx * this.rsin + this.centerY;

	/*
	 * handle drag gesture (mouse wheel button)
	 */
	if (buttons === (1 << Aria.ButtonCode.BUTTON_WHEEL)) {

		if (!this.dragActive) {
			// save the fractal coordinate of the mouse position. that stays constant during the drag gesture
			this.dragActiveX = x;
			this.dragActiveY = y;
			this.dragActive = true;
		}

		// update x/y but keep radius
		this.setPosition(this.centerX - x + this.dragActiveX, this.centerY - y + this.dragActiveY, this.radius);
	} else {
		this.dragActive = false;
	}

	/*
	 * Mouse button gestures. The mouse pointer coordinate should not change
	 */
	if (config.zoomSpeed) {
		// convert normalised zoom speed (-1<=speed<=+1) to magnification and scale to this time interval
		var magnify = Math.pow(config.magnificationNow, config.zoomSpeed * diffSec);

		// zoom, The mouse pointer coordinate should not change
		this.setPosition((this.centerX - x) / magnify + x, (this.centerY - y) / magnify + y, this.radius / magnify);
	}

	// window.gui.domStatusQuality.innerHTML = JSON.stringify({zoomSpeed:this.zoomSpeed, radius: window.viewport.radius});

	this.tickLast = tickNow;
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
	var iter = 0, maxiter = window.config.depthNow;
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
	if (this.initY >= this.diameter)
		return;

	var ji = this.initY * this.diameter;

	var minY = this.centerY - this.radiusY;
	var maxY = this.centerY + this.radiusY;
	var y = minY + (maxY-minY) * this.initY / this.diameter;

	for (var i = 0; i < this.diameter; i++) {
		// distance to center
		var x = (this.centerX - this.radiusX) + this.radiusX*2 * i / this.diameter;

		var z = this.mand_calc(0,0,x,y);

		this.pixels[ji++] = z % 16;
	}

	this.initY++;
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

	/** @member {number} - viewport mouse X coordinate */
	this.mouseX = 0;
	/** @member {number} - viewport mouse Y coordinate */
	this.mouseY = 0;
	/** @member {number} - viewport mouse button state. OR-ed set of Aria.ButtonCode */
	this.buttons = 0;

	/** @member {number} - Main loop timer id */
	this.timerId = 0;
	/** @member {number} - Timestamp next vsync */
	this.vsync = 0;
	/** @member {number} - Number of frames painted */
	this.frameNr = 0;
	/** @member {number} - Number of scanlines calculated for current frame */
	this.numLines = 0;

	/** @member {number} - Damping coefficient low-pass filter for following fields */
	this.coef = 0.05;
		/** @member {number} - Average time in mSec spent in stage1 (Draw) */
	this.statState1 = 0;
	/** @member {number} - Average time in mSec spent in stage2 (Zoom) */
	this.statState2 = 0;
	/** @member {number} - Average time in mSec spent in stage3 (Lines) */
	this.statState3 = 0;

	// per second differences
	this.mainloopNr = 0;
	this.lastNow = 0;
	this.lastFrame = 0;
	this.lastLoop = 0;

	/*
	 * Find the elements and replace the string names for DOM references
	 */
	for (var property in this) {
		if (this.hasOwnProperty(property) && property.substr(0,3) === "dom") {
			this[property] = document.getElementById(this[property]);
		}
	}

	// initial palette
	this.paletteRed = [230, 135, 75, 254, 255, 246, 223, 255, 255, 197, 255, 255, 214, 108, 255, 255];
	this.paletteGreen = [179, 135, 75, 203, 244, 246, 223, 212, 224, 146, 235, 247, 214, 108, 255, 255];
	this.paletteBlue = [78, 135, 75, 102, 142, 246, 223, 111, 123, 45, 133, 145, 214, 108, 153, 255];
	// grayscale
	this.paletteRed = [0x00,0x10,0x20,0x30,0x40,0x50,0x60,0x70,0x80,0x90,0xa0,0xb0,0xc0,0xd0,0xe0,0xf0];
	this.paletteGreen = [0x00,0x10,0x20,0x30,0x40,0x50,0x60,0x70,0x80,0x90,0xa0,0xb0,0xc0,0xd0,0xe0,0xf0];
	this.paletteBlue = [0x00,0x10,0x20,0x30,0x40,0x50,0x60,0x70,0x80,0x90,0xa0,0xb0,0xc0,0xd0,0xe0,0xf0];

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
	});
	this.home.setCallbackValueChange(function(newValue) {
	});

	this.counter = 0;
	this.paletteGroup.setCallbackFocusChange(function(newButton) {
	});
}

/**
 * Handle keyboard down event
 *
 * @param {KeyboardEvent} event
 */
GUI.prototype.handleKeyDown = function (event) {
	var type = event.type;

	// Grab the keydown and click events
	switch (event.keyCode) {
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
	var type = event.type;

	// Grab the keydown and click events
	switch (event.keyCode) {
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
	if (this.buttons === 0 && event.buttons !== 0) {
		// on first button press set release listeners
		document.addEventListener("mousemove", this.handleMouse);
		document.addEventListener("mouseup", this.handleMouse);
		document.addEventListener("contextmenu", this.handleMouse);
	}

	this.mouseX = event.pageX - rect.left;
	this.mouseY = event.pageY - rect.top;
	this.buttons = event.buttons;

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
	this.numLines = 0;
	this.statState1 = this.statState2 = this.statState3 = 0;
	this.config.tickLast = performance.now();
	this.timerId = window.setTimeout(this.mainloop, 1);
};

/**
 * stop the mainloop
 */
GUI.prototype.stop = function() {
	clearTimeout(this.timerId);
	this.timerId = null;
	this.state = 0;
};

/**
 * Synchronise screen updates
 *
 * @param {number} time
 */
GUI.prototype.animationFrame = function(time) {
	// paint image
	// NOTE: opposite buffer than used in paintViewport()

	if (this.frameNr&1)
		this.ctx.putImageData(this.imagedata2, 0, 0);
	else
		this.ctx.putImageData(this.imagedata1, 0, 0);
};


/**
 * GUI mainloop called by timer event
 *
 * @returns {boolean}
 */
GUI.prototype.mainloop = function() {
	if (!this.state)
		return false;

	this.mainloopNr++;

	// make local for speed
	var config = this.config;

	// current time
	var now = performance.now();

	if (this.mainloopNr === 1 || now > this.vsync + 2000) {
		// first call has a long (70mSec) delay
		// Missed vsync by more than 2 seconds, resync
		this.vsync = now + (1000 / config.framerateNow);
		this.state = 1;
	}

	/*
	 * Fast path
	 */
	if (this.state === 3) {
		// test for vsync
		if (now >= this.vsync) {
			/*
			 * Update stats
			 */
			if (this.numLines > 0) {
				this.statState3 += (this.numLines - this.statState3) * this.coef;
				this.numLines = 0;
			}

			/*
			 * Request to paint previously prepared frame
			 */
			this.frameNr++; // switch frames, must do before calling requestAnimationFrame()
			this.vsync += (1000 / config.framerateNow); // time of next vsync
			window.requestAnimationFrame(this.animationFrame);

			/*
			 * Reset state
			 */
			this.state = 1;

			// yield and return as quick as possible
			window.postMessage("mainloop", "*");
			return true;
		}
		// don't even start if there is less than 2mSec left till next vsync
		if (now >= this.vsync-2) {
			// todo: which queue to choose
			this.timerId = window.setTimeout(this.mainloop, 1);
			// window.postMessage("mainloop", "*");
			return true;
		}

		// end time is 2mSec before next vertical sync
		var endtime = this.vsync - 2;
		if (endtime > now + 2)
			endtime = now + 2;

		if (window.viewport.initY >= window.viewport.diameter) {
			// sleep abit
			// this.timerId = window.setTimeout(this.mainloop, 1);
			// return true;
			window.viewport.initY = 0;
		}

		/*
		 * Calculate lines
		 */
		while (now < endtime) {
			window.viewport.renderLines();

			now = performance.now();
			this.numLines++;
		}

		// yield and return as quick as possible
		window.postMessage("mainloop", "*");
		return true;
	}

	/*
	 * test for viewport resize
	 */
	if (this.domViewport.clientWidth !== this.domViewport.width || this.domViewport.clientHeight !== this.domViewport.height) {
		// set property
		this.domViewport.width = this.domViewport.clientWidth;
		this.domViewport.height = this.domViewport.clientHeight;

		// create new Viewport
		var oldViewport = window.viewport;
		var newViewport = new Viewport(this.domViewport.width, this.domViewport.height);
		window.viewport = newViewport;

		// inherit settings
		newViewport.setPosition(oldViewport.centerX, oldViewport.centerY, oldViewport.radius);

		// update GUI
		this.domWxH.innerHTML = "[" + newViewport.viewWidth + "x" + newViewport.viewHeight + "]";

		// Create image buffers
		this.ctx = this.domViewport.getContext("2d");
		this.imagedata1 = this.ctx.createImageData(newViewport.viewWidth, newViewport.viewHeight);
		this.imagedata2 = this.ctx.createImageData(newViewport.viewWidth, newViewport.viewHeight);
	}

	/*
	 * Update colour palette cycle offset and viewport angle
	 */
	window.viewport.handleChange(now, this.mouseX, this.mouseY, this.buttons);

	var last = now;
	if (this.state === 1) {
		/*
		 * State1: Paint viewport
		 */

		if (this.frameNr&1)
			window.viewport.paint(this.config.angle, this.paletteRed, this.paletteGreen, this.paletteBlue, this.imagedata1);
		else
			window.viewport.paint(this.config.angle, this.paletteRed, this.paletteGreen, this.paletteBlue, this.imagedata2);

		now = performance.now();
		this.statState1 += ((now - last) - this.statState1) * this.coef;

		this.state = 2;

	} else if (this.state === 2) {
		/*
		 * State2: zoom/autopilot
		 */
//		navEngine.ontick(now, endtime);

		now = performance.now();
		this.statState2 += ((now - last) - this.statState2) * this.coef;

		this.state = 3;
	}

	// this.domViewport.innerHTML = ((avgS+avgU)*100/config.frametime).toFixed()+'% (sys:'+avgS.toFixed()+'mSec+usr:'+avgU.toFixed()+'mSec) ['+stxt+']';
	this.domStatusRect.innerHTML =
		"paint:" + this.statState1.toFixed(3) +
		"mSec("+ (this.statState1*100/(1000 / config.framerateNow)).toFixed(0) +
		"%), zoom:" + this.statState2.toFixed(3) +
		"mSec, lines:" + this.statState3.toFixed(0)
	;

	if (Math.floor(now/1000) !== this.lastNow) {
		this.domStatusLoad.innerHTML = "FPS:"+(this.frameNr - this.lastFrame) + " IPS:" + (this.mainloopNr - this.lastLoop);
		this.lastNow = 	Math.floor(now/1000);
		this.lastFrame = this.frameNr;
		this.lastLoop = this.mainloopNr;
	}

	// yield and return as quick as possible
	this.timerId = window.setTimeout(this.mainloop, 0);

	return true;
};
