/*
*   This content is licensed according to the W3C Software License at
*   https://www.w3.org/Consortium/Legal/2015/copyright-software-and-document
*
*   File:   button.js
*
*   Desc:   JS code for Button Design Pattersn
*/

var Button = function (domButton) {
	this.down = false;
	this.active = false;
	this.domButton = domButton;

	this.handleValueChange = function (newValue) {
	};
	this.setHandleValueChange = function(handler) {
		this.handleValueChange = handler;
		handler(this.down);
	};

	this.handlePressed = function (newValue) {
	};
	this.setHandlePressed = function(handler) {
		this.handlePressed = handler;
	};

	domButton.addEventListener('mousedown', this.handleDown.bind(this));
	domButton.addEventListener('mouseup', this.handleUp.bind(this));
	domButton.addEventListener('keydown', this.handleDown.bind(this));
	domButton.addEventListener('keyup', this.handleUp.bind(this));
	domButton.addEventListener('focus', this.handleFocus.bind(this));
	domButton.addEventListener('blur', this.handleBlur.bind(this));

	domButton.setAttribute('tabindex', '0');

};

Button.prototype.handleFocus = function (event) {
	this.domButton.classList.add('focus');
};
Button.prototype.handleBlur = function (event) {
	this.domButton.classList.remove('focus');
};


Button.prototype.handleDown = function(event) {
	var type = event.type;

	// Grab the keydown and click events
	if (type === 'mousedown') {
		this.goDown();
	} else if (event.keyCode === 13 || event.keyCode === 32) {
		this.goDown();
	} else {
		return;
	}

	this.domButton.focus();

	event.preventDefault();
	event.stopPropagation();
};

Button.prototype.handleUp = function(event) {
	var type = event.type;

	// Grab the keydown and click events
	if (type === 'mouseup') {
		this.goUp();
	} else if (event.keyCode === 13 || event.keyCode === 32) {
		this.goUp();
	} else {
		return;
	}

	this.domButton.focus();

	event.preventDefault();
	event.stopPropagation();
};

Button.prototype.goDown = function() {
	if (this.down)
		return;
	this.down = true;

	this.domButton.classList.add('active');

	var currentState = this.domButton.getAttribute('aria-pressed');
	if (currentState) {
		// 2-state button, down switches state

		// Set the new aria-pressed state on the button
		if (this.active) {
			this.active = false;
			this.domButton.setAttribute('aria-pressed', 'false');
		} else {
			this.active = true;
			this.domButton.setAttribute('aria-pressed', 'true');
		}
		this.handleValueChange(this.active);
	} else {
		this.handlePressed();
	}
};
Button.prototype.goUp = function() {
	this.down = false;
	this.domButton.classList.remove('active');

	var currentState = this.domButton.getAttribute('aria-pressed');
	if (currentState) {
		// 2-state button, up does nothing
	}
};

Button.prototype.toggleButtonState = function(event) {
	var currentState = this.domButton.getAttribute('aria-pressed');
	if (currentState) {
		// 2-state button

	}

	this.handleValueChange(this.down);
};
