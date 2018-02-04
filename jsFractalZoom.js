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

	// construct sliders
	this.speed = new Slider(this.domSpeedThumb, this.domSpeedRail);
	this.rotate = new Slider(this.domRotateThumb, this.domRotateRail);
	this.cycle = new Slider(this.domCycleThumb, this.domCycleRail);
	this.depth = new Slider(this.domDepthThumb, this.domDepthRail);
	this.framerate = new Slider(this.domFramerateThumb, this.domFramerateRail);

	// construct listboxes
	this.formulaList = new aria.Listbox(this.domFormulaList);
	this.incolourList = new aria.Listbox(this.domIncolourList);
	this.outcolourList = new aria.Listbox(this.domOutcolourList);
	this.planeList = new aria.Listbox(this.domPlaneList);

	// construct controlling listbox button
	this.formula = new aria.ListboxButton(this.domFormulaButton, this.formulaList);
	this.incolour = new aria.ListboxButton(this.domIncolourButton, this.incolourList);
	this.outcolour = new aria.ListboxButton(this.domOutcolourButton, this.outcolourList);
	this.plane = new aria.ListboxButton(this.domPlaneButton, this.planeList);

	// construct buttons
	this.power = new Button(this.domPowerButton, true);
	this.autoPilot = new Button(this.domAutoPilotButton, true);
	this.home = new Button(this.domHomeButton, false);
	this.randomPalette = new Button(this.domRandomPaletteButton, true);
	this.defaultPalette = new Button(this.domDefaultPaletteButton, true);

	// add listener for mainview focus
	this.domMain.addEventListener('focus', this.handleFocus.bind(this));
	this.domMain.addEventListener('blur', this.handleBlur.bind(this));

	// attach event listeners
	var self = this;

	// sliders
	this.speed.setHandleValueChange(function(newValue) {
		self.config.speed = newValue;
		self.domSpeedLeft.innerHTML = newValue;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.rotate.setHandleValueChange(function(newValue) {
		self.config.rotate = newValue;
		self.domRotateLeft.innerHTML = newValue;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.cycle.setHandleValueChange(function(newValue) {
		self.config.cycle = newValue;
		self.domCycleLeft.innerHTML = newValue;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.depth.setHandleValueChange(function(newValue) {
		self.config.depth = newValue;
		self.domDepthLeft.innerHTML = newValue;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.framerate.setHandleValueChange(function(newValue) {
		self.config.framerate = newValue;
		self.domFramerateLeft.innerHTML = newValue;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});

	// listboxes
	this.formulaList.setHandleFocusChange(function(focusedItem) {
		self.config.formula = focusedItem.id;
		self.domFormulaButton.innerText = focusedItem.innerText;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.incolourList.setHandleFocusChange(function(focusedItem) {
		self.config.incolour = focusedItem.id;
		self.domIncolourButton.innerText = focusedItem.innerText;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.outcolourList.setHandleFocusChange(function(focusedItem) {
		self.config.outcolour = focusedItem.id;
		self.domOutcolourButton.innerText = focusedItem.innerText;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.planeList.setHandleFocusChange(function(focusedItem) {
		self.config.plane = focusedItem.id;
		self.domPlaneButton.innerText = focusedItem.innerText;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});

	// buttons
	this.power.setHandleValueChange(function(newValue) {
		self.config.power = newValue;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.autoPilot.setHandleValueChange(function(newValue) {
		self.config.autoPilot = newValue;
		self.domMain.innerHTML = JSON.stringify(config, null, '<br/>');
	});
	this.home.setHandlePressed(function(newValue) {
		self.domMain.innerHTML = 'HOME';
	});

	// radiogroup
	this.paletteGroup = new RadioGroup(document.getElementById('idPaletteGroup'));
	this.paletteGroup.init();

	this.paletteGroup.setHandleFocusChange(function(focusedItem) {
		self.domMain.innerHTML = focusedItem.domNode.id;
	});

	// shortcut handler
	window.addEventListener('keydown', this.handleKeyDown.bind(this));
	window.addEventListener('keyup', this.handleKeyUp.bind(this));
}

GUI.prototype.handleKeyDown = function (event) {
	var type = event.type;

	// Grab the keydown and click events
	switch (event.keyCode) {
		case 'Px':
		case 'px':
			break;
		case 0x41: // A
		case 0x61: // a
			this.autoPilot.goDown();
			this.domAutoPilotButton.focus();
			break;
		case 0x44: // D
		case 0x64: // d
			this.paletteGroup.radioButtons[1].goDown();
			this.domDefaultPaletteButton.focus();
			break;
		case 0x46: // F
		case 0x66: // f
			if (this.formula.keyToggle(event))
				this.domFormulaButton.focus();
			else
				this.domMain.focus();
			break;
		case 0x49: // I
		case 0x69: // i
			if (this.incolour.keyToggle(event))
				this.domIncolourButton.focus();
			else
				this.domMain.focus();
			break;
		case 0x4f: // O
		case 0x6f: // o
			if (this.outcolour.keyToggle(event))
				this.domOutcolourButton.focus();
			else
				this.domMain.focus();
			break;
		case 0x50: // P
		case 0x70: // p
			if (this.plane.keyToggle(event))
				this.domPlaneButton.focus();
			else
				this.domMain.focus();
			break;
		case 0x51: // Q
		case 0x71: // q
			this.power.goDown();
			this.domPowerButton.focus();
			break;
		case 0x52: // R
		case 0x72: // r
			this.paletteGroup.radioButtons[0].goDown();
			this.domRandomPaletteButton.focus();
			break;
		case aria.KeyCode.HOME:
			this.home.goDown();
			this.domHomeButton.focus();
			break;
		case aria.KeyCode.UP:
			this.speed.moveSliderTo(this.speed.valueNow + 1);
			this.domSpeedThumb.focus();
			break;
		case aria.KeyCode.DOWN:
			this.speed.moveSliderTo(this.speed.valueNow - 1);
			this.domSpeedThumb.focus();
			break;
		case aria.KeyCode.PAGE_UP:
			this.rotate.moveSliderTo(this.rotate.valueNow + 1);
			this.domRotateThumb.focus();
			break;
		case aria.KeyCode.PAGE_DOWN:
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
			this.autoPilot.goUp();
			this.domMain.focus();
			break;
		case 0x44: // D
		case 0x64: // d
			this.paletteGroup.radioButtons[1].goUp();
			this.domMain.focus();
			break;
		case 0x51: // Q
		case 0x71: // q
			this.power.goUp();
			this.domMain.focus();
			break;
		case 0x52: // R
		case 0x62: // r
			this.paletteGroup.radioButtons[0].goUp();
			this.domMain.focus();
			break;
		case aria.KeyCode.HOME:
			this.home.goUp();
			this.domMain.focus();
			break;
		case aria.KeyCode.UP:
			this.domMain.focus();
			break;
		case aria.KeyCode.DOWN:
			this.domMain.focus();
			break;
		case aria.KeyCode.PAGE_DOWN:
			this.domMain.focus();
			break;
		case aria.KeyCode.PAGE_UP:
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
