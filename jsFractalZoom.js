/*
 * Globals settings and values
 *
 * @constructor
 */
function Config() {
	this.power = true;
	this.autoPilot = false;
	this.speed = 0;
	this.rotate = 0;
	this.cycle = 0;
	this.depth = 0;
	this.framerate = 0;
	this.formula = '';
	this.incolour = '';
	this.outcolour = '';
	this.plane = '';
}

/**
 * DOM bindings and event handlers
 *
 * @param config {Config}
 * @constructor
 */
function GUI(config) {
	this.config = config;

	/*
	 * DOM elements and their matching id's
	 */
	this.domMain = 'main';
	this.domStatusQuality = 'idStatusQuality';
	this.domStatusLoad = 'idStatusLoad';
	this.domStatusRect = 'idStatusRect';
	this.domPowerButton = 'idPowerButton';
	this.domAutoPilotButton = 'idAutoPilotButton';
	this.domHomeButton = 'idHomeButton';
	this.domFormula = 'idFormula';
	this.domFormulaLeft = 'idFormulaLeft';
	this.domFormulaButton = 'idFormulaButton';
	this.domFormulaList = 'idFormulaList';
	this.domIncolour = 'idIncolour';
	this.domIncolourLeft = 'idIncolourLeft';
	this.domIncolourButton = 'idIncolourButton';
	this.domIncolourList = 'idIncolourList';
	this.domOutcolour = 'idOutcolour';
	this.domOutcolourLeft = 'idOutcolourLeft';
	this.domOutcolourButton = 'idOutcolourButton';
	this.domOutcolourList = 'idOutcolourList';
	this.domPlane = 'idPlane';
	this.domPlaneLeft = 'idPlaneLeft';
	this.domPlaneButton = 'idPlaneButton';
	this.domPlaneList = 'idPlaneList';
	this.domSpeed = 'idSpeed';
	this.domSpeedLeft = 'idSpeedLeft';
	this.domSpeedRail = 'idSpeedRail';
	this.domSpeedThumb = 'idSpeedThumb';
	this.domRotate = 'idRotate';
	this.domRotateLeft = 'idRotateLeft';
	this.domRotateRail = 'idRotateRail';
	this.domRotateThumb = 'idRotateThumb';
	this.domCycle = 'idCycle';
	this.domCycleLeft = 'idCycleLeft';
	this.domCycleRail = 'idCycleRail';
	this.domCycleThumb = 'idCycleThumb';
	this.domPalette = 'idPalette';
	this.domPaletteLeft = 'idPaletteLeft';
	this.domRandomPaletteButton = 'idRandomPaletteButton';
	this.domDefaultPaletteButton = 'idDefaultPaletteButton';
	this.domDepth = 'idDepth';
	this.domDepthLeft = 'idDepthLeft';
	this.domDepthRail = 'idDepthRail';
	this.domDepthThumb = 'idDepthThumb';
	this.domFramerate = 'idFramerate';
	this.domFramerateLeft = 'idFramerateLeft';
	this.domFramerateRail = 'idFramerateRail';
	this.domFramerateThumb = 'idFramerateThumb';

	/*
	 * Find the elemets and replace the string names for DOM references
	 */
	for (var property in this) {
		if (this.hasOwnProperty(property) && property.substr(0,3) === 'dom') {
			this[property] = document.getElementById(this[property]);
		}
	}

	// register global key bindings before widgets override
	document.addEventListener('keydown', this.handleKeyDown.bind(this));
	document.addEventListener('keyup', this.handleKeyUp.bind(this));

	// construct sliders
	this.speed = new Aria.Slider(this.domSpeedThumb, this.domSpeedRail);
	this.rotate = new Aria.Slider(this.domRotateThumb, this.domRotateRail);
	this.cycle = new Aria.Slider(this.domCycleThumb, this.domCycleRail);
	this.depth = new Aria.Slider(this.domDepthThumb, this.domDepthRail);
	this.framerate = new Aria.Slider(this.domFramerateThumb, this.domFramerateRail);

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
	this.paletteGroup = new Aria.RadioGroup(document.getElementById('idPaletteGroup'));
	this.randomPalette = this.paletteGroup.radioButtons[0];
	this.defaultPalette = this.paletteGroup.radioButtons[1];

	// add listener for mainview focus
	this.domMain.addEventListener('focus', this.handleFocus.bind(this));
	this.domMain.addEventListener('blur', this.handleBlur.bind(this));

	// attach event listeners
	var self = this;

	// sliders
	this.speed.setCallbackValueChange(function(newValue) {
		self.config.speed = newValue;
		self.domSpeedLeft.innerHTML = newValue;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.rotate.setCallbackValueChange(function(newValue) {
		self.config.rotate = newValue;
		self.domRotateLeft.innerHTML = newValue;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.cycle.setCallbackValueChange(function(newValue) {
		self.config.cycle = newValue;
		self.domCycleLeft.innerHTML = newValue;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.depth.setCallbackValueChange(function(newValue) {
		self.config.depth = newValue;
		self.domDepthLeft.innerHTML = newValue;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.framerate.setCallbackValueChange(function(newValue) {
		self.config.framerate = newValue;
		self.domFramerateLeft.innerHTML = newValue;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});

	// listboxes
	this.formula.listbox.setCallbackFocusChange(function(focusedItem) {
		self.config.formula = focusedItem.id;
		self.domFormulaButton.innerText = focusedItem.innerText;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.incolour.listbox.setCallbackFocusChange(function(focusedItem) {
		self.config.incolour = focusedItem.id;
		self.domIncolourButton.innerText = focusedItem.innerText;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.outcolour.listbox.setCallbackFocusChange(function(focusedItem) {
		self.config.outcolour = focusedItem.id;
		self.domOutcolourButton.innerText = focusedItem.innerText;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.plane.listbox.setCallbackFocusChange(function(focusedItem) {
		self.config.plane = focusedItem.id;
		self.domPlaneButton.innerText = focusedItem.innerText;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});

	// buttons
	this.power.setCallbackValueChange(function(newValue) {
		self.config.power = newValue;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.autoPilot.setCallbackValueChange(function(newValue) {
		self.config.autoPilot = newValue;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.home.setCallbackValueChange(function(newValue) {
		self.domMain.innerHTML = 'HOME';
	});

	this.counter = 0;
	this.paletteGroup.setCallbackFocusChange(function(newButton) {
		self.domMain.innerHTML = newButton.domButton.id + ' ' + (self.counter++);
	});
}

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
				this.domMain.focus();
			break;
		case 0x49: // I
		case 0x69: // i
			if (!this.incolour.toggleListbox(event))
				this.domMain.focus();
			break;
		case 0x4f: // O
		case 0x6f: // o
			if (!this.outcolour.toggleListbox(event))
				this.domMain.focus();
			break;
		case 0x50: // P
		case 0x70: // p
			if (!this.plane.toggleListbox(event))
				this.domMain.focus();
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
			this.domSpeedThumb.focus();
			break;
		case Aria.KeyCode.DOWN:
			this.speed.moveSliderTo(this.speed.valueNow - 1);
			this.domSpeedThumb.focus();
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

GUI.prototype.handleKeyUp = function (event) {
	var type = event.type;

	// Grab the keydown and click events
	switch (event.keyCode) {
		case 0x41: // A
		case 0x61: // a
			this.autoPilot.buttonUp();
			this.domMain.focus();
			break;
		case 0x44: // D
		case 0x64: // d
			this.paletteGroup.radioButtons[1].buttonUp();
			this.domMain.focus();
			break;
		case 0x51: // Q
		case 0x71: // q
			this.power.buttonUp();
			this.domMain.focus();
			break;
		case 0x52: // R
		case 0x62: // r
			this.paletteGroup.radioButtons[0].buttonUp();
			this.domMain.focus();
			break;
		case Aria.KeyCode.HOME:
			this.home.buttonUp();
			this.domMain.focus();
			break;
		case Aria.KeyCode.UP:
			this.domMain.focus();
			break;
		case Aria.KeyCode.DOWN:
			this.domMain.focus();
			break;
		case Aria.KeyCode.PAGE_DOWN:
			this.domMain.focus();
			break;
		case Aria.KeyCode.PAGE_UP:
			this.domMain.focus();
			break;
	}

	event.preventDefault();
	event.stopPropagation();

};

GUI.prototype.handleFocus = function (event) {
	this.domMain.classList.add('focus');
};
GUI.prototype.handleBlur = function (event) {
	this.domMain.classList.remove('focus');
};
