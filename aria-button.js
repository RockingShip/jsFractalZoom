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
	this.domButton = domButton;

	domButton.addEventListener('click', toggleButtonEventHandler);
	// domButton.addEventListener('keydown', toggleButtonEventHandler);
	// domButton.addEventListener('keyup', toggleButtonEventHandler);

	domButton.addEventListener('keydown', toggleButtonEventHandler.bind(this));
	domButton.addEventListener('keyup', toggleButtonEventHandler.bind(this));
	domButton.addEventListener('focus', this.handleFocus.bind(this));
	domButton.addEventListener('blur', this.handleBlur.bind(this));
};

Button.prototype.handleFocus = function (event) {
	this.domButton.classList.add('focus');
};
Button.prototype.handleBlur = function (event) {
	this.domButton.classList.remove('focus');
};


function toggleButtonEventHandler(event) {
	var type = event.type;

	// Grab the keydown and click events
	if (type === 'keydown') {
		// If either enter or space is pressed, execute the funtion
		if (event.keyCode === 13 || event.keyCode === 32) {
			event.preventDefault();
			event.stopPropagation();
			this.domButton.focus();

			if (this.down)
				return;
			this.down = true;
			this.domButton.classList.add('active');
		}
	}
	else if (type === 'click') {
		toggleButtonState(event);
	} else {
		if (event.keyCode === 13 || event.keyCode === 32) {
			event.preventDefault();
			event.stopPropagation();
			this.domButton.focus();

			this.down = false;
			this.domButton.classList.remove('active');
			toggleButtonState(event);
		}
	}
}

function toggleButtonState(event) {
	var button = event.target;
	var currentState = button.getAttribute('aria-pressed');
	var newState = 'true';

	// If aria-pressed is set to true, set newState to false
	if (currentState === 'true') {
		newState = 'false';
	}

	// Set the new aria-pressed state on the button
	button.setAttribute('aria-pressed', newState);
}
