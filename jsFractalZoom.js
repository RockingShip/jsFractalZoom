"use strict";

/*
 * Globals settings and values
 *
 * @constructor
 */
function Config() {
	this.tickLast = 0;

	this.power = true;
	this.autoPilot = false;

	/** @type {number} - Frames per second */
	this.Framerate = 20;
	/** @type {number} - mSec per frame */
	this.msecPerFrame = 1000 / this.Framerate;

	/** @type {number} - current viewport angle (degrees) */
	this.angle = 0;
	/** @type {number} - user set rotation speed. range -1 <= x <= +1 */
	this.rotateSpeed = 0;
	/** @type {number} - angle increment per mSec given rotateSpeed=1 */
	this.rotateIncrement = 360 / 1000.0; // max speed is 1 revolution per second

	/** @type {number} - current viewport zoomspeed */
	this.zoomSpeed = 0;
	/** @type {number} - GUI set maximum viewport zoomspeed. range -1 <= x <= +1 */
	this.zoomSpeedMax = 0;
	/** @type {number} - zoomspeed increment per second GUI given zoomSpeedMax=1 */
	this.zoomSpeedIncrement = 1;
	/** @type {number} - After 1sec, get 80% closer to target speed */
	this.zoomSpeedCoef = 0.80;

	
	this.offsetSpeed = 0;
	this.offsetIncrement = 0.1; // cycle increment
	this.depth = 0;
	this.formula = "";
	this.incolour = "";
	this.outcolour = "";
	this.plane = "";
	this.width = 1;
	this.height = 1;
	this.sec=0;

	this.offset = 0; // color palette cycle timer updated

}

/**
 * Set colour palette cycle offset
 *
 * @param {number} newValue - range -1.0 <= newValue <= +1.0
 */
Config.prototype.setOffset = function(newValue) {
	this.offset = newValue;
};

/**
 * Set Framerate
 *
 * @param {number} newValue
 */
Config.prototype.setFramerate = function(newValue) {
	this.Framerate = newValue;
	this.msecPerFrame = 1000 / this.Framerate;
};

/**
 * Set zoom speed
 *
 * @param {number} newValue - range 0 <= newValue <= +1.0
 */
Config.prototype.setZoomSpeedMax = function(newValue) {
	this.zoomSpeedMax = newValue;
};

/**
 * Set rotate speed
 *
 * @param {number} newValue - range -1.0 <= newValue <= +1.0
 */
Config.prototype.setRotateSpeed = function(newValue) {
	this.rotateSpeed = newValue;
};

/**
 * Set colour palette cycle speed
 *
 * @param {number} newValue - range -1.0 <= newValue <= +1.0
 */
Config.prototype.setCycleSpeed = function(newValue) {
	this.offsetSpeed = newValue;
};

/**
 * Update values to current time. Best called during vertical sync
 *
 * @param {number} tickNow
 * @param {number} buttons - OR-ed set of Aria.ButtonCode
 */
Config.prototype.updateTick = function(tickNow, buttons) {

	var diffTick = tickNow - this.tickLast;

	if (this.offsetSpeed)
		this.setOffset(this.offset + diffTick * this.offsetIncrement * this.offsetSpeed);
	if (this.rotateSpeed)
		this.angle += diffTick * this.rotateIncrement * this.rotateSpeed;

	if (buttons === (1<<Aria.ButtonCode.BUTTON_LEFT)) {
		// zoom-in only
		this.zoomSpeed = +1 - (+1 - this.zoomSpeed) * Math.pow((1 - this.zoomSpeedCoef), diffTick / 1000);
	} else if (buttons === (1<<Aria.ButtonCode.BUTTON_RIGHT)) {
		// zoom-out only
		this.zoomSpeed = -1 - (-1 - this.zoomSpeed) * Math.pow((1 - this.zoomSpeedCoef), diffTick / 1000);
	} else if (buttons === 0) {
		// buttons released
		this.zoomSpeed = this.zoomSpeed * Math.pow((1 - this.zoomSpeedCoef), diffTick / 1000);

		if (this.zoomSpeed >= -0.001 && this.zoomSpeed < +0.001)
			this.zoomSpeed = 0; // full stop
	}

	this.tickLast = tickNow;
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

	/** @type {Uint8Array} - temporary red palette after rotating palette index */
	this.tmpRed = new Uint8Array(256);
	/** @type {Uint8Array} - temporary red palette after rotating palette index */
	this.tmpGreen = new Uint8Array(256);
	/** @type {Uint8Array} - temporary red palette after rotating palette index */
	this.tmpBlue = new Uint8Array(256);

	/** @type {number} - width of viewport */
	this.viewWidth = width;
	/** @type {number} - height of viewport */
	this.viewHeight = height;
	/** @type {number} - diameter of the pixel data */
	this.diameter = Math.ceil(Math.sqrt(this.viewWidth * this.viewWidth + this.viewHeight * this.viewHeight));
	/** @type {Uint8Array} - pixel data (must be square) */
	this.pixels = new Uint8Array(this.diameter * this.diameter);

	this.centerX = 0;
	this.centerY = 0;
	this.radiusX = 0;
	this.radiusY = 0;
	this.radius = 2;

	/** @type {number} - sin(angle) */
	this.rsin = Math.sin(this.angle * Math.PI / 180);
	/** @type {number} - cos(angle) */
	this.rcos = Math.cos(this.angle * Math.PI / 180);

	this.lastTick = 0;
	this.dragActive = false;
	this.dragActiveX = 0;
	this.dragActiveY = 0;
	this.initY = 0;
}

/**
 * Set the center coordinate and radius.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} r
 */
Viewport.prototype.setPosition = function(x, y, r) {
	this.centerX = x;
	this.centerY = y;
	this.radius = r;

	var t = Math.sqrt(this.viewWidth * this.viewWidth + this.viewHeight * this.viewHeight);
	this.radiusX = r * this.viewWidth / t;
	this.radiusY = r * this.viewHeight / t;
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
	var offset = Math.round(window.config.offset % paletteSize);
	if (offset < 0)
		offset += paletteSize;

	// apply colour cycling
	for (i = 0; i < paletteSize; i++) {
		tmpRed[i] = paletteRed[(i + offset) % paletteSize];
		tmpGreen[i] = paletteGreen[(i + offset) % paletteSize];
		tmpBlue[i] = paletteBlue[(i + offset) % paletteSize];
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
 * Update values to current time. Best called during vertical sync
 *
 * @param {number} tickNow
 * @param {number} buttons - OR-ed set of Aria.ButtonCode
 */
Viewport.prototype.updateTick = function(tickNow, buttons) {

	if (this.lastTick === 0) {
		// sync on first call
		this.lastTick = tickNow;
		return;
	}

	var diffTick = tickNow - this.tickLast;

	// if (this.offsetSpeed)
	// 	this.setOffset(this.offset + diffTick * this.offsetIncrement * this.offsetSpeed);
	// if (this.rotateSpeed)
	// 	window.viewport.setAngle(this.angle + diffTick * this.rotateIncrement * this.rotateSpeed);

	// if (buttons === (1<<Aria.ButtonCode.BUTTON_LEFT)) {
		// zoom-in only
		// this.zoomSpeed = +1 - (+1 - this.zoomSpeed) * Math.pow((1 - this.zoomSpeedCoef), diffTick / 1000);
	// } else if (buttons === (1<<Aria.ButtonCode.BUTTON_RIGHT)) {
		// zoom-out only
		// this.zoomSpeed = -1 - (-1 - this.zoomSpeed) * Math.pow((1 - this.zoomSpeedCoef), diffTick / 1000);
	// } else if (buttons === 0) {
		// buttons released
		// this.zoomSpeed = this.zoomSpeed * Math.pow((1 - this.zoomSpeedCoef), diffTick / 1000);
		//
		// if (this.zoomSpeed >= -0.001 && this.zoomSpeed < +0.001)
		// 	this.zoomSpeed = 0; // full stop
	// }

	this.tickLast = tickNow;
};

/**
 * Handle mouse movement.
 * Left button - zoom in
 * Center button - drag
 * Right button - zoom out
 *
 * @param {number} mouseX
 * @param {number} mouseY
 * @param {number} buttons - OR-ed set of Aria.ButtonCode
 */
Viewport.prototype.handleMovement = function(mouseX, mouseY, buttons) {
	/*
	 * handle drag gesture (mouse wheel button)
	 */
	if (buttons === (1 << Aria.ButtonCode.BUTTON_WHEEL)) {
		// translate viewport coordinate to pixel coordinate
		var x = mouseX * this.radiusX * 2 / this.viewWidth - this.radiusX;
		var y = mouseY * this.radiusY * 2 / this.viewHeight - this.radiusY;
		var t = x;
		x = y * this.rsin + t * this.rcos + this.centerX;
		y = y * this.rcos - t * this.rsin + this.centerY;

		if (!this.dragActive) {
			// save starting position
			this.dragActiveX = x;
			this.dragActiveY = y;
			this.dragActive = true;
		} else {
			this.setPosition(this.centerX - x + this.dragActiveX, this.centerY - y + this.dragActiveY, this.radius);
		}
	} else {
		this.dragActive = false;
	}

};

/**
 * Background renderer. Simple image
 */
Viewport.prototype.renderLines = function() {
	if (this.initY >= this.diameter)
		return;

	var y = this.initY - this.diameter / 2;
	var yx = this.initY * this.diameter;

	for (var x = -this.diameter / 2; x < this.diameter / 2; x++) {
		// distance to center
		var r = Math.sqrt(x * x + y * y);

		// get base t
		var t = (Math.atan2(y, x) + Math.PI) / Math.PI / 2;

		// find which modulo
		var rhi = 0, rlo = 0;
		for (var i = 12; i >= 0; i--) {
			rhi = rlo;
			rlo = Math.pow(Math.PI / 2, t + i);

			if (r >= rlo && r < rhi)
				break;
		}

		var z = (r - rlo) / (rhi - rlo);
		z = Math.round(z * 16);
		this.pixels[yx++] = z % 16;
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
	/** @type {Config} - Reference to config object */
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
	this.domCycleSpeedLeft = "idCycleSpeedLeft";
	this.domCycleSpeedRail = "idCycleSpeedRail";
	this.domCycleSpeedThumb = "idCycleSpeedThumb";
	this.domRandomPaletteButton = "idRandomPaletteButton";
	this.domDefaultPaletteButton = "idDefaultPaletteButton";
	this.domDepthLeft = "idDepthLeft";
	this.domDepthRail = "idDepthRail";
	this.domDepthThumb = "idDepthThumb";
	this.domFramerateLeft = "idFramerateLeft";
	this.domFramerateRail = "idFramerateRail";
	this.domFramerateThumb = "idFramerateThumb";
	this.domWxH = "WxH";

	/** @type {number} - viewport mouse X coordinate */
	this.mouseX = 0;
	/** @type {number} - viewport mouse Y coordinate */
	this.mouseY = 0;
	/** @type {number} - viewport mouse button state. OR-ed set of Aria.ButtonCode */
	this.buttons = 0;

	/** @type {number} - Main loop timer id */
	this.timerId = 0;
	/** @type {number} - Timestamp next vsync */
	this.vsync = 0;
	/** @type {number} - Number of frames painted */
	this.frameNr = 0;
	/** @type {number} - Number of scanlines calculated for current frame */
	this.numLines = 0;

	/** @type {number} - Damping coefficient low-pass filter for following fields */
	this.coef = 0.05;
		/** @type {number} - Average time in mSec spent in stage1 (Draw) */
	this.statState1 = 0;
	/** @type {number} - Average time in mSec spent in stage2 (Zoom) */
	this.statState2 = 0;
	/** @type {number} - Average time in mSec spent in stage3 (Lines) */
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
	this.speed = new Aria.Slider(this.domZoomSpeedThumb, this.domZoomSpeedRail);
	this.rotate = new Aria.Slider(this.domRotateThumb, this.domRotateRail);
	this.cycle = new Aria.Slider(this.domCycleSpeedThumb, this.domCycleSpeedRail);
	this.depth = new Aria.Slider(this.domDepthThumb, this.domDepthRail);
	this.Framerate = new Aria.Slider(this.domFramerateThumb, this.domFramerateRail);

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
		self.config.setZoomSpeedMax(newValue / 100); // scale to 0 <= newValue <= +1.0
		self.domZoomSpeedLeft.innerHTML = newValue;
	});
	this.rotate.setCallbackValueChange(function(newValue) {
		self.config.setRotateSpeed(newValue / 100); // scale to -1.0 <= newValue <= +1.0
		self.domRotateLeft.innerHTML = newValue;
	});
	this.cycle.setCallbackValueChange(function(newValue) {
		self.config.setCycleSpeed(newValue / 100); // scale to -1.0 <= newValue <= +1.0
		self.domCycleSpeedLeft.innerHTML = newValue;
	});
	this.depth.setCallbackValueChange(function(newValue) {
		self.config.depth = newValue;
		self.domDepthLeft.innerHTML = newValue;
	});
	this.Framerate.setCallbackValueChange(function(newValue) {
		self.config.setFramerate(newValue);
		self.domFramerateLeft.innerHTML = newValue;
	});

	// listboxes
	this.formula.listbox.setCallbackFocusChange(function(focusedItem) {
		self.config.formula = focusedItem.id;
		self.domFormulaButton.innerText = focusedItem.innerText;
	});
	this.incolour.listbox.setCallbackFocusChange(function(focusedItem) {
		self.config.incolour = focusedItem.id;
		self.domIncolourButton.innerText = focusedItem.innerText;
	});
	this.outcolour.listbox.setCallbackFocusChange(function(focusedItem) {
		self.config.outcolour = focusedItem.id;
		self.domOutcolourButton.innerText = focusedItem.innerText;
	});
	this.plane.listbox.setCallbackFocusChange(function(focusedItem) {
		self.config.plane = focusedItem.id;
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
			this.rotate.moveSliderTo(this.rotate.valueNow + 1);
			this.domRotateThumb.focus();
			break;
		case Aria.KeyCode.PAGE_DOWN:
			this.rotate.moveSliderTo(this.rotate.valueNow - 1);
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

	window.viewport.handleMovement(this.mouseX, this.mouseY, this.buttons);
	
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
	this.vsync = performance.now() + this.config.msecPerFrame; // vsync wakeup time
	this.numLines = 0;
	this.statState1 = this.statState2 = this.statState3 = this.config.msecPerFrame / 2;
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
		this.vsync= now + config.msecPerFrame;
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
			this.vsync += config.msecPerFrame; // time of next vsync
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
			this.timerId = window.setTimeout(this.mainloop, 1);
			return true;
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
	config.updateTick(now, this.buttons);
	window.viewport.handleMovement(this.mouseX, this.mouseY, this.buttons);

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
		"mSec("+ (this.statState1*100/config.msecPerFrame).toFixed(0) +
		"%), zoom:" + this.statState2.toFixed(3) +
		"mSec, lines:" + this.statState3.toFixed(0)
	;

	if (Math.floor(now/1000) !== this.lastNow) {
		this.domStatusLoad.innerHTML = "FPS:"+(this.frameNr - this.lastFrame) + " IPS:" + (this.mainloopNr - this.lastLoop);
		this.lastNow = 	Math.floor(now/1000);
		this.lastFrame = this.frameNr;
		this.lastLoop = this.mainloopNr;
		config.sec++;
	}

	// yield and return as quick as possible
	this.timerId = window.setTimeout(this.mainloop, 0);

	return true;
};
