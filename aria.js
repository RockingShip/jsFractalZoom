/*
 *   This content is licensed according to the W3C Software License at
 *   https://www.w3.org/Consortium/Legal/2015/copyright-software-and-document
 *
 *   The file is a heavy adaptation of the aria examples specifically tailored for jsFractalZoom
 *
 * https://www.w3.org/TR/wai-aria-practices/examples/button/js/button.js
 * https://www.w3.org/TR/wai-aria-practices/examples/slider/js/slider.js
 * https://www.w3.org/TR/wai-aria-practices/examples/listbox/js/listbox-collapsible.js
 * https://www.w3.org/TR/wai-aria-practices/examples/listbox/js/listbox.js
 * https://www.w3.org/TR/wai-aria-practices/examples/radio/radio-1/js/radioButton.js
 * https://www.w3.org/TR/wai-aria-practices/examples/radio/radio-1/js/radioGroup.js
 *
 */

/**
 * @namespace Aria
 */
var Aria = Aria || {};

/**
 * Keyboard binding constant definitions
 *
 * @constructor Aria.KeyCode
 */
Aria.KeyCode = Object.freeze({
	BACKSPACE: 8,
	RETURN: 13,
	ESC: 27,
	SPACE: 32,
	PAGE_UP: 33,
	PAGE_DOWN: 34,
	END: 35,
	HOME: 36,
	LEFT: 37,
	UP: 38,
	RIGHT: 39,
	DOWN: 40,
	DELETE: 46
});

/**
 * Mouse button constant definitions
 *
 * @constructor Aria.ButtonCode
 */
Aria.ButtonCode = Object.freeze({
	BUTTON_LEFT: 0, // for righthanded mouse, left button
	BUTTON_WHEEL: 2, // for righthanded mouse, wheel button
	BUTTON_RIGHT: 1  // for righthanded mouse, right button
});

/**
 * Button object representing the state and interactions for a standalone (1 or 2 state) widget
 *
 * @constructor Aria.Button
 *
 * @param {Element} domButton
 */
Aria.Button = function (domButton) {

	/**
	 * Attached DOM node
	 * @member {Element}
	 */
	this.domButton = domButton;

	/**
	 * True is button is being pushed down
	 * @member {boolean}
	 */
	this.down = false;

	/**
	 * Called when button state/value changes
	 * @callback Aria.Button~callbackValueChange
 	 * @param {boolean} newValue
	 */
	this.callbackValueChange = function (newValue) {
	};

	/*
	 * Register event listeners
	 */
	this.domButton.addEventListener('mousedown', this.handleMouseDown.bind(this));
	this.domButton.addEventListener('mouseup', this.handleMouseUp.bind(this));
	this.domButton.addEventListener('keydown', this.handleKeyDown.bind(this));
	this.domButton.addEventListener('keyup', this.handleKeyUp.bind(this));
	this.domButton.addEventListener('focus', this.handleFocus.bind(this));
	this.domButton.addEventListener('blur', this.handleBlur.bind(this));
};

/**
 * Set callback handler for value changes
 *
 * @param {Aria.Button~callbackValueChange} handler
 */
Aria.Button.prototype.setCallbackValueChange = function(handler) {
	this.callbackValueChange = handler;

	var currentState = this.domButton.getAttribute('aria-pressed');
	handler(currentState === 'true');
};

/**
 * Button down gesture
 */
Aria.Button.prototype.buttonDown = function() {
	// catch keyboard repeats
	if (this.down)
		return;
	this.down = true;

	var currentState = this.domButton.getAttribute('aria-pressed');
	if (currentState) {
		// 2-state button, down gesture toggles active state
		if (currentState === 'true') {
			currentState = 'false';
			this.domButton.setAttribute('aria-pressed', 'false');
			this.domButton.classList.remove('active');
		} else {
			currentState = 'true';
			this.domButton.setAttribute('aria-pressed', 'true');
			this.domButton.classList.add('active');
		}
	} else {
		this.domButton.classList.add('active');
	}

	// activate callback
	this.callbackValueChange(currentState === 'true');
};

/**
 *  Button up gesture
 */
Aria.Button.prototype.buttonUp = function() {
	this.down = false;

	// remove CSS decoration
	this.domButton.classList.remove('active');
};

/**
 * Handle focus event
 *
 * @param {FocusEvent} event
 */
Aria.Button.prototype.handleFocus = function (event) {
	this.domButton.classList.add('focus');
};

/**
 * Handle blur event
 *
 * @param {FocusEvent} event
 */
Aria.Button.prototype.handleBlur = function (event) {
	this.domButton.classList.remove('focus');
};


/**
 * Handle key down event
 *
 * @param {KeyboardEvent} event
 */
Aria.Button.prototype.handleKeyDown = function(event) {
	var key = event.which || event.keyCode;

	if (key === Aria.KeyCode.RETURN || key === Aria.KeyCode.SPACE) {
		this.buttonDown();
	} else {
		return;
	}

	event.preventDefault();
	event.stopPropagation();
};

/**
 * Handle keyboard release event
 *
 * @param {KeyboardEvent} event
 */
Aria.Button.prototype.handleKeyUp = function(event) {
	var key = event.which || event.keyCode;

	if (key === Aria.KeyCode.RETURN || key === Aria.KeyCode.SPACE) {
		this.buttonUp();
	} else {
		return;
	}

	event.preventDefault();
	event.stopPropagation();
};

/**
 * Handle mouse down event
 *
 * @param {MouseEvent} event
 */
Aria.Button.prototype.handleMouseDown = function(event) {
	this.buttonDown();

	event.preventDefault();
	event.stopPropagation();

	// Ensure thumb has focus
	this.domButton.focus();
};

/**
 * Handle mouse release event
 *
 * @param {MouseEvent} event
 */
Aria.Button.prototype.handleMouseUp = function(event) {
	this.buttonUp();

	event.preventDefault();
	event.stopPropagation();
};

/**
 * Create Slider that contains value, valuemin, valuemax, and valuenow
 *
 * @constructor Aria.Slider
 *
 * @param {Element} domThumb
 * @param {Element} domRail
 */
Aria.Slider = function (domThumb, domRail, valueMin, valueMax, valueNow) {

	/**
	 * Attached DOM node to the movable thumb
	 * @member {Element}
	 */
	this.domThumb = domThumb;

	/**
	 * Attached DOM node to the background rail
	 * @member {Element}
	 */
	this.domRail = domRail;

	/**
	 * Minimum value
	 * @member {number}
	 */
	this.valueMin = valueMin;

	/**
	 * Maximum value
	 * @member {number}
	 */
	this.valueMax = valueMax;

	/**
	 * Current value
	 * @member {number}
	 */
	this.valueNow = valueNow;

	/**
	 * Called when button state/value changes
	 *
	 * @callback Aria.Slider~callbackValueChange
	 * @param {number} newValue
	 */
	this.callbackValueChange = function (newValue) {
	};

	/*
	 * Set attributes
	 */
	this.domThumb.setAttribute('aria-valuemin', this.valueMin);
	this.domThumb.setAttribute('aria-valuemax', this.valueMax);
	this.domThumb.setAttribute('aria-valuenow', this.valueNow);

	/*
	 * Register event listeners
	 */
	this.domThumb.addEventListener('mousedown', this.handleMouseDownThumb.bind(this));
	this.domThumb.addEventListener('focus', this.handleFocus.bind(this));
	this.domThumb.addEventListener('blur', this.handleBlur.bind(this));
	this.domRail.addEventListener('keydown', this.handleKeyDown.bind(this));
	this.domRail.addEventListener('keyup', this.handleKeyUp.bind(this));
	this.domRail.addEventListener('mousedown', this.handleMouseDownRail.bind(this));

	// Move thumb to initial position
	this.moveSliderTo(this.valueNow);
};

/**
 * Set callback handler for value changes
 *
 * @param {Aria.Slider~callbackValueChange} handler
 */
Aria.Slider.prototype.setCallbackValueChange = function(handler) {
	this.callbackValueChange = handler;
	handler(this.valueNow);
};

/**
 * Move thumb to proper position
 *
 * @param {number} value
 */
Aria.Slider.prototype.moveSliderTo = function (value) {

	// bounds check
	if (value > this.valueMax)
		value = this.valueMax;
	if (value < this.valueMin)
		value = this.valueMin;


	this.valueNow = value;

	this.domThumb.setAttribute('aria-valuenow', this.valueNow);

	var pos = ((this.valueNow - this.valueMin) * this.domRail.clientWidth) / (this.valueMax - this.valueMin) - (this.domThumb.clientWidth / 2) ;
	this.domThumb.style.left = Math.round(pos) + 'px';

	// trigger callback
	this.callbackValueChange(this.valueNow);
};

/**
 * Handle focus event
 *
 * @param {FocusEvent} event
 */
Aria.Slider.prototype.handleFocus = function (event) {
	this.domThumb.classList.add('focus');
	this.domRail.classList.add('focus');
};

/**
 * Handle blur event
 *
 * @param {FocusEvent} event
 */
Aria.Slider.prototype.handleBlur = function (event) {
	this.domThumb.classList.remove('focus');
	this.domRail.classList.remove('focus');
};

/**
 * Handle keyboard down event (on rail)
 *
 * @param {KeyboardEvent} event
 */
Aria.Slider.prototype.handleKeyDown = function (event) {
	var key = event.which || event.keyCode;

	switch (key) {
		case Aria.KeyCode.LEFT:
		case Aria.KeyCode.DOWN:
			this.moveSliderTo(this.valueNow - 1);
			break;

		case Aria.KeyCode.RIGHT:
		case Aria.KeyCode.UP:
			this.moveSliderTo(this.valueNow + 1);
			break;

		case Aria.KeyCode.PAGE_DOWN:
			this.moveSliderTo(this.valueNow - 10);
			break;

		case Aria.KeyCode.PAGE_UP:
			this.moveSliderTo(this.valueNow + 10);
			break;

		case Aria.KeyCode.HOME:
			this.moveSliderTo(this.valueMin);
			break;

		case Aria.KeyCode.END:
			this.moveSliderTo(this.valueMax);
			break;

		default:
			return;
	}

	event.preventDefault();
	event.stopPropagation();

};

/**
 * Handle keyboard down event (on rail)
 *
 * @param {KeyboardEvent} event
 */
Aria.Slider.prototype.handleKeyUp = function (event) {
	var key = event.which || event.keyCode;

	switch (key) {
		case Aria.KeyCode.LEFT:
		case Aria.KeyCode.DOWN:
		case Aria.KeyCode.RIGHT:
		case Aria.KeyCode.UP:
		case Aria.KeyCode.PAGE_DOWN:
		case Aria.KeyCode.PAGE_UP:
		case Aria.KeyCode.HOME:
		case Aria.KeyCode.END:
			break;
		default:
			return;
	}

	event.preventDefault();
	event.stopPropagation();

};

/**
 * Handle mouse down event (on thumb)
 *
 * @param {MouseEvent} event
 */
Aria.Slider.prototype.handleMouseDownThumb = function (event) {

	var self = this;

	var handleMouseMove = function (event) {

		var rect = self.domRail.getBoundingClientRect();
		var diffX = event.pageX - rect.left;

		var newValue = self.valueMin + ((self.valueMax - self.valueMin) * diffX) / self.domRail.clientWidth;
		self.moveSliderTo(newValue);

		event.preventDefault();
		event.stopPropagation();

		// Ensure thumb has focus
		self.domThumb.focus();
	};

	var handleMouseUp = function (event) {

		document.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('mouseup', handleMouseUp);

	};

	// bind a mousemove event handler to move pointer
	document.addEventListener('mousemove', handleMouseMove);

	// bind a mouseup event handler to stop tracking mouse movements
	document.addEventListener('mouseup', handleMouseUp);

	event.preventDefault();
	event.stopPropagation();

	// Ensure thumb has focus
	self.domThumb.focus();

};

/**
 * Handle mouse down event (on rail)
 *
 * @param {MouseEvent} event
 */
Aria.Slider.prototype.handleMouseDownRail = function (event) {

	var rect = this.domRail.getBoundingClientRect();
	var diffX = event.pageX - rect.left;

	var newValue = this.valueMin + ((this.valueMax - this.valueMin) * diffX) / this.domRail.clientWidth;
	this.moveSliderTo(newValue);

	event.preventDefault();
	event.stopPropagation();

	// Ensure thumb has focus
	this.domThumb.focus();
};

/**
 * Collapsible Dropdown Listbox
 *
 * @constructor Aria.ListboxButton
 *
 * @param {Element} domButton
 * @param {Element} domList
 */
Aria.ListboxButton = function (domButton, domList) {
	/**
	 * Attached DOM node to the activation button
	 * @member {Element}
	 */
	this.domButton = domButton;

	/**
	 * Attached DOM node to the dropdown list
	 * @member {Element}
	 */
	this.domList = domList;

	/**
	 * State object listbox
	 * @member {Aria.Listbox}
	 */
	this.listbox = new Aria.Listbox(domList);

	/*
	 * Register event handlers
	 */
	this.domButton.addEventListener('click', this.toggleListbox.bind(this));
	this.domButton.addEventListener('keydown', this.checkShow.bind(this));
	this.domButton.addEventListener('focus', this.handleFocus.bind(this));
	this.domButton.addEventListener('blur', this.handleBlur.bind(this));
	// override listbox handlers
	this.domList.addEventListener('blur', this.hideListbox.bind(this));
	this.domList.addEventListener('keydown', this.checkHide.bind(this));
};

/**
 * Open dropdown gesture
 */
Aria.ListboxButton.prototype.showListbox = function () {
	this.domList.classList.remove('hidden');
	this.domButton.setAttribute('aria-expanded', 'true');

	// set focus on listbox
	this.domList.focus();
};

/**
 * Close dropdown gesture
 */
Aria.ListboxButton.prototype.hideListbox = function (event) {
	// clicking the button is a close gesture
	if (event && event.relatedTarget === this.domButton)
		return;

	this.domList.classList.add('hidden');
	this.domButton.removeAttribute('aria-expanded');

	// set focus on button
	this.domButton.focus();
};

/**
 * Show/hide gesture
 *
 * @returns {boolean} - Return true when list opens, false when list closes
 */
Aria.ListboxButton.prototype.toggleListbox = function () {
	if (this.domList.classList.contains('hidden')) {
		this.showListbox();
		// need to set focus on listbox so it receives keyboard events
		this.domList.focus();
		return true;
	} else {
		this.hideListbox();
		return false;
	}
};

/**
 * Handle focus event
 *
 * @param {FocusEvent} event
 */
Aria.ListboxButton.prototype.handleFocus = function (event) {
	this.domButton.classList.add('focus');
};

/**
 * Handle blur event
 *
 * @param {FocusEvent} event
 */
Aria.ListboxButton.prototype.handleBlur = function (event) {
	this.domButton.classList.remove('focus');
};

/**
 * Handle keydown event when focus on button
 *
 * @param {KeyboardEvent} event
 */
Aria.ListboxButton.prototype.checkShow = function (event) {
	var key = event.which || event.keyCode;

	switch (key) {
		case Aria.KeyCode.RETURN:
		case Aria.KeyCode.UP:
		case Aria.KeyCode.DOWN:
			this.showListbox();
			break;
		default:
			return;
	}

	event.preventDefault();
	event.stopPropagation();
};

/**
 * Handle keyup event when focus on listbox
 *
 * @param {KeyboardEvent} event
 */
Aria.ListboxButton.prototype.checkHide = function (event) {
	var key = event.which || event.keyCode;

	switch (key) {
		case Aria.KeyCode.RETURN:
		case Aria.KeyCode.ESC:
			this.hideListbox();
			break;
		default:
			return;
	}

	event.preventDefault();
	event.stopPropagation();
};

/**
 * Listbox object representing the state and interactions for a listbox widget
 *
 * @constructor Aria.Listbox
 *
 * @param {Element} domList
 */
Aria.Listbox = function (domList) {

	/**
	 * The DOM node pointing to the listbox
	 * @member {Element}
	 */
	this.domList = domList;

	/**
	 * @member {string | null}
	 */
	this.activeDescendant = this.domList.getAttribute('aria-activedescendant');

	/**
	 * @member {string}
	 */
	this.keysSoFar = '';

	/**
	 * Called when button state/value changes
	 *
	 * @callback callbackFocusChange
	 * @param {Element} newElement
	 */
	this.callbackFocusChange = function (newElement) {
	};

	/*
	 * Register events
	 */
	this.domList.addEventListener('focus', this.setupFocus.bind(this));
	this.domList.addEventListener('keydown', this.handleKeyDown.bind(this));
	this.domList.addEventListener('keyup', this.handleKeyUp.bind(this));
	this.domList.addEventListener('click', this.handleClick.bind(this));

	// setup first
	this.setupFocus();
};

/**
 * Defocus the specified item
 *
 * @param {Element} element - The element to defocus
 */
Aria.Listbox.prototype.defocusItem = function (element) {
	if (!element)
		return;

	element.classList.remove('focused');
};

/**
 * Focus on the specified item
 *
 * @param {Element} element - The element to focus
 */
Aria.Listbox.prototype.focusItem = function (element) {
	this.defocusItem(document.getElementById(this.activeDescendant));

	element.classList.add('focused');
	this.domList.setAttribute('aria-activedescendant', element.id);
	this.activeDescendant = element.id;

	if (this.domList.scrollHeight > this.domList.clientHeight) {
		var scrollBottom = this.domList.clientHeight + this.domList.scrollTop;
		var elementBottom = element.offsetTop + element.offsetHeight;

		if (elementBottom > scrollBottom)
			this.domList.scrollTop = elementBottom - this.domList.clientHeight;
		else if (element.offsetTop < this.domList.scrollTop)
			this.domList.scrollTop = element.offsetTop;
	}

	this.callbackFocusChange(element);
};

/**
 *
 * @param key
 * @returns {null | Element}
 */
Aria.Listbox.prototype.findItemToFocus = function (key) {
	var itemList = this.domList.querySelectorAll('[role="option"]');
	var character = String.fromCharCode(key);

	if (!this.keysSoFar) {
		for (var i = 0; i < itemList.length; i++) {
			if (itemList[i].getAttribute('id') === this.activeDescendant) {
				this.searchIndex = i;
			}
		}
	}
	this.keysSoFar += character;
	this.clearKeysSoFarAfterDelay();

	var nextMatch = this.findMatchInRange(
		itemList,
		this.searchIndex + 1,
		itemList.length
	);
	if (!nextMatch) {
		nextMatch = this.findMatchInRange(
			itemList,
			0,
			this.searchIndex
		);
	}
	return nextMatch;
};

/**
 *
 */
Aria.Listbox.prototype.clearKeysSoFarAfterDelay = function () {
	if (this.keyClear) {
		clearTimeout(this.keyClear);
		this.keyClear = null;
	}
	this.keyClear = setTimeout((function () {
		this.keysSoFar = '';
		this.keyClear = null;
	}).bind(this), 500);
};

/**
 *
 * @param {Element[]} list
 * @param {number} startIndex
 * @param {number} endIndex
 * @returns {null | Element}
 */
Aria.Listbox.prototype.findMatchInRange = function (list, startIndex, endIndex) {
	// Find the first item starting with the keysSoFar substring, searching in
	// the specified range of items
	for (var n = startIndex; n < endIndex; n++) {
		var label = list[n].innerText;
		if (label && label.toUpperCase().indexOf(this.keysSoFar) === 0) {
			return list[n];
		}
	}
	return null;
};

/**
 * If there is no activeDescendant, focus on the first option
 */
Aria.Listbox.prototype.setupFocus = function () {
	if (!this.activeDescendant)
		this.focusFirstItem();
};

/**
 * Focus on the first option
 */
Aria.Listbox.prototype.focusFirstItem = function () {
	var firstItem = this.domList.querySelector('[role="option"]');

	if (firstItem)
		this.focusItem(firstItem);
};

/**
 * Focus on the last option
 */
Aria.Listbox.prototype.focusLastItem = function () {
	var itemList = this.domList.querySelectorAll('[role="option"]');

	if (itemList.length)
		this.focusItem(itemList[itemList.length - 1]);
};

/**
 *
 * @param {callbackFocusChange} focusChangeHandler
 */
Aria.Listbox.prototype.setCallbackFocusChange = function (focusChangeHandler) {
	this.callbackFocusChange = focusChangeHandler;

	var focusElement = document.getElementById(this.activeDescendant);
	focusChangeHandler(focusElement);
};

/**
 * Handle keyboard down
 *
 * @param {KeyboardEvent} event
 */
Aria.Listbox.prototype.handleKeyDown = function (event) {
	var key = event.which || event.keyCode;

	var nextItem = document.getElementById(this.activeDescendant);
	if (!nextItem)
		return;

	switch (key) {
		case Aria.KeyCode.PAGE_UP:
		case Aria.KeyCode.PAGE_DOWN:
			break;
		case Aria.KeyCode.UP:
		case Aria.KeyCode.DOWN:
			if (key === Aria.KeyCode.UP) {
				nextItem = nextItem.previousElementSibling;
			} else {
				nextItem = nextItem.nextElementSibling;
			}

			if (nextItem)
				this.focusItem(nextItem);
			break;
		case Aria.KeyCode.HOME:
			this.focusFirstItem();
			break;
		case Aria.KeyCode.END:
			this.focusLastItem();
			break;
		case Aria.KeyCode.SPACE:
			break;
		case Aria.KeyCode.BACKSPACE:
		case Aria.KeyCode.DELETE:
		case Aria.KeyCode.RETURN:
			break;
		default:
			var itemToFocus = this.findItemToFocus(key);
			if (itemToFocus) {
				this.focusItem(itemToFocus);
				break;
			}
			return;
	}

	event.preventDefault();
	event.stopPropagation();
};

/**
 * Handle keyboard up
 *
 * @param {KeyboardEvent} event
 */
Aria.Listbox.prototype.handleKeyUp = function (event) {
	var key = event.which || event.keyCode;

	switch (key) {
		case Aria.KeyCode.PAGE_UP:
		case Aria.KeyCode.PAGE_DOWN:
		case Aria.KeyCode.UP:
		case Aria.KeyCode.DOWN:
		case Aria.KeyCode.HOME:
		case Aria.KeyCode.END:
		case Aria.KeyCode.SPACE:
		case Aria.KeyCode.BACKSPACE:
		case Aria.KeyCode.DELETE:
		case Aria.KeyCode.RETURN:
			// catch these keys so they do not change focus to other controls and closes the listbox
			break;
		default:
			var itemToFocus = this.findItemToFocus(key);
			if (itemToFocus) {
				this.focusItem(itemToFocus);
				break;
			}
			return;
	}

	event.preventDefault();
	event.stopPropagation();
};

/**
 * Check if an item is clicked on. If so, focus on it and select it.
 *
 * @param {MouseEvent} event - The click event object
 */
Aria.Listbox.prototype.handleClick = function (event) {
	if (event.target.getAttribute('role') === 'option')
		this.focusItem(event.target);
};

/**
 * Button object representing the state and interactions for a standalone (1 or 2 state) widget
 *
 * @constructor Aria.Button
 *
 * @param {Element} domButton
 * @param {Aria.RadioGroup} radioGroup
 */
Aria.RadioButton = function (domButton, radioGroup) {

	/**
	 * Attached DOM node
	 * @member {Element}
	 */
	this.domButton = domButton;

	/**
	 * Group this button belongs to
	 */
	this.radioGroup = radioGroup;

	/**
	 * True is button is being pushed down
	 * @member {boolean}
	 */
	this.down = false;

	/*
	 * Register event listeners
	 */
	this.domButton.addEventListener('mousedown', this.handleMouseDown.bind(this));
	this.domButton.addEventListener('mouseup', this.handleMouseUp.bind(this));
	this.domButton.addEventListener('keydown', this.handleKeyDown.bind(this));
	this.domButton.addEventListener('keyup', this.handleKeyUp.bind(this));
	this.domButton.addEventListener('focus', this.handleFocus.bind(this));
	this.domButton.addEventListener('blur', this.handleBlur.bind(this));
};

/**
 * Button down gesture
 */
Aria.RadioButton.prototype.buttonDown = function() {
	// catch keyboard repeats
	if (this.down)
		return;
	this.down = true;

	this.radioGroup.setChecked(this);
	this.domButton.classList.add('active');
};

/**
 *  Button up gesture
 */
Aria.RadioButton.prototype.buttonUp = function() {
	this.down = false;
	this.domButton.classList.remove('active');
};

/**
 * Handle focus event
 *
 * @param {FocusEvent} event
 */
Aria.RadioButton.prototype.handleFocus = function (event) {
	this.domButton.classList.add('focus');
};

/**
 * Handle blur event
 *
 * @param {FocusEvent} event
 */
Aria.RadioButton.prototype.handleBlur = function (event) {
	this.domButton.classList.remove('focus');
};


/**
 * Handle key down event
 *
 * @param {KeyboardEvent} event
 */
Aria.RadioButton.prototype.handleKeyDown = function(event) {
	var key = event.which || event.keyCode;

	switch (key) {
		case Aria.KeyCode.SPACE:
		case Aria.KeyCode.RETURN:
			this.buttonDown();
			break;
		case Aria.KeyCode.UP:
			this.radioGroup.setCheckedToPreviousItem(this);
			break;
		case Aria.KeyCode.DOWN:
			this.radioGroup.setCheckedToNextItem(this);
			break;
		case Aria.KeyCode.LEFT:
			this.radioGroup.setCheckedToPreviousItem(this);
			break;
		case Aria.KeyCode.RIGHT:
			this.radioGroup.setCheckedToNextItem(this);
			break;
		default:
			return;
	}

	event.stopPropagation();
	event.preventDefault();
};

/**
 * Handle keyboard release event
 *
 * @param {KeyboardEvent} event
 */
Aria.RadioButton.prototype.handleKeyUp = function(event) {
	var key = event.which || event.keyCode;

	switch (key) {
		case Aria.KeyCode.SPACE:
		case Aria.KeyCode.RETURN:
			this.buttonUp();
			break;
		case Aria.KeyCode.UP:
		case Aria.KeyCode.DOWN:
		case Aria.KeyCode.LEFT:
		case Aria.KeyCode.RIGHT:
			break;
		default:
			return;
	}

	event.stopPropagation();
	event.preventDefault();
};

/**
 * Handle mouse down event
 *
 * @param {MouseEvent} event
 */
Aria.RadioButton.prototype.handleMouseDown = function(event) {
	this.buttonDown();

	event.preventDefault();
	event.stopPropagation();

	// Ensure thumb has focus
	this.domButton.focus();
};

/**
 * Handle mouse release event
 *
 * @param {MouseEvent} event
 */
Aria.RadioButton.prototype.handleMouseUp = function(event) {
	this.buttonUp();

	event.preventDefault();
	event.stopPropagation();
};

/**
 * @constructor Aria.RadioGroup
 *
 * @param {Element} domGroup
 */
Aria.RadioGroup = function (domGroup) {

	/**
	 * @member {Element}
	 */
	this.domGroup = domGroup;

	/**
	 * @member {Aria.RadioButton[]}
	 */
	this.radioButtons = [];

	/**
	 * @member {Aria.RadioButton}
	 */
	this.firstRadioButton = null;

	/**
	 * @member {Aria.RadioButton}
	 */
	this.lastRadioButton = null;

	/**
	 * @member {Aria.RadioButton}
	 */
	this.checkedRadioButton = null;

	/**
	 * Called when button switches
	 *
	 * @callback Aria.RadioGroup~callbackFocusChange
	 * @param {Aria.RadioButton} newButton
	 */
	this.callbackFocusChange = function (newButton) {
	};

	/**
	 * find and add group members
	 */
	var rbs = this.domGroup.querySelectorAll('[role=radio]');

	for (var i = 0; i < rbs.length; i++) {
		var rb = new Aria.RadioButton(rbs[i], this);
		this.radioButtons.push(rb);

		if (!this.firstRadioButton)
			this.firstRadioButton = rb;
		this.lastRadioButton = rb;

		if (!this.checkedRadioButton && rb.domButton.getAttribute('aria-checked') === 'true')
			this.checkedRadioButton = rb;
	}

	/*
	 * set initial state
	 */
	if (!this.checkedRadioButton)
		this.checkedRadioButton = this.firstRadioButton;
	this.setChecked(this.checkedRadioButton);
};


/**
 * @param {Aria.RadioGroup~callbackFocusChange} focusChangeHandler
 */
Aria.RadioGroup.prototype.setCallbackFocusChange = function (focusChangeHandler) {
	this.callbackFocusChange = focusChangeHandler;
	focusChangeHandler(this.checkedRadioButton);
};

/**
 * Select button of radio group
 *
 * @param {Aria.RadioButton} currentItem
 */
Aria.RadioGroup.prototype.setChecked  = function (currentItem) {
	for (var i = 0; i < this.radioButtons.length; i++) {
		var rb = this.radioButtons[i];
		if (rb !== currentItem) {
			rb.domButton.setAttribute('aria-checked', 'false');
			rb.domButton.tabIndex = -1;
		}
	}
	currentItem.domButton.setAttribute('aria-checked', 'true');
	currentItem.domButton.tabIndex = 0;
	currentItem.domButton.focus();
	this.callbackFocusChange(currentItem);
};

/**
 * Select previous button in sequence of radio group
 *
 * @param {Aria.RadioButton} currentItem
 */
Aria.RadioGroup.prototype.setCheckedToPreviousItem = function (currentItem) {
	if (currentItem === this.firstRadioButton) {
		this.setChecked(this.lastRadioButton);
	} else {
		var index = this.radioButtons.indexOf(currentItem);
		this.setChecked(this.radioButtons[index - 1]);
	}
};

/**
 * Select next button in sequence of radio group
 *
 * @param {Aria.RadioButton} currentItem
 */
Aria.RadioGroup.prototype.setCheckedToNextItem = function (currentItem) {
	if (currentItem === this.lastRadioButton) {
		this.setChecked(this.firstRadioButton);
	} else {
		var index = this.radioButtons.indexOf(currentItem);
		this.setChecked(this.radioButtons[index + 1]);
	}
};
