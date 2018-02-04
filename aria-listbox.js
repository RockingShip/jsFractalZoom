/*
*   This content is licensed according to the W3C Software License at
*   https://www.w3.org/Consortium/Legal/2015/copyright-software-and-document
*/
/**
 * @namespace aria
 */
var aria = aria || {};

/**
 * @constructor
 *
 * @desc
 *  Listbox object representing the state and interactions for a listbox widget
 *
 * @param listboxNode
 *  The DOM node pointing to the listbox
 */
aria.Listbox = function (listboxNode) {
	this.listboxNode = listboxNode;
	this.activeDescendant = this.listboxNode.getAttribute('aria-activedescendant');
	this.keysSoFar = '';
	this.handleFocusChange = function () {
	};
	this.registerEvents();
};

/**
 * @desc
 *  Register events for the listbox interactions
 */
aria.Listbox.prototype.registerEvents = function () {
	this.listboxNode.addEventListener('focus', this.setupFocus.bind(this));
	this.listboxNode.addEventListener('keydown', this.checkKeyPress.bind(this));
	this.listboxNode.addEventListener('click', this.checkClickItem.bind(this));
};

/**
 * @desc
 *  If there is no activeDescendant, focus on the first option
 */
aria.Listbox.prototype.setupFocus = function () {
	if (this.activeDescendant) {
		return;
	}

	this.focusFirstItem();
};

/**
 * @desc
 *  Focus on the first option
 */
aria.Listbox.prototype.focusFirstItem = function () {
	var firstItem = this.listboxNode.querySelector('[role="option"]');

	if (firstItem) {
		this.focusItem(firstItem);
	}
};

/**
 * @desc
 *  Focus on the last option
 */
aria.Listbox.prototype.focusLastItem = function () {
	var itemList = this.listboxNode.querySelectorAll('[role="option"]');

	if (itemList.length) {
		this.focusItem(itemList[itemList.length - 1]);
	}
};

/**
 * @desc
 *  Handle various keyboard controls; UP/DOWN will shift focus; SPACE selects
 *  an item.
 *
 * @param evt
 *  The keydown event object
 */
aria.Listbox.prototype.checkKeyPress = function (evt) {
	var key = evt.which || evt.keyCode;
	var nextItem = document.getElementById(this.activeDescendant);

	if (!nextItem) {
		return;
	}

	switch (key) {
		case aria.KeyCode.PAGE_UP:
		case aria.KeyCode.PAGE_DOWN:
			break;
		case aria.KeyCode.UP:
		case aria.KeyCode.DOWN:
			evt.preventDefault();

			if (key === aria.KeyCode.UP) {
				nextItem = nextItem.previousElementSibling;
			}
			else {
				nextItem = nextItem.nextElementSibling;
			}

			if (nextItem) {
				this.focusItem(nextItem);
			}

			break;
		case aria.KeyCode.HOME:
			evt.preventDefault();
			this.focusFirstItem();
			break;
		case aria.KeyCode.END:
			evt.preventDefault();
			this.focusLastItem();
			break;
		case aria.KeyCode.SPACE:
			evt.preventDefault();
			break;
		case aria.KeyCode.BACKSPACE:
		case aria.KeyCode.DELETE:
		case aria.KeyCode.RETURN:
			break;
		default:
			var itemToFocus = this.findItemToFocus(key);
			if (itemToFocus) {
				this.focusItem(itemToFocus);
			}
			break;
	}
};

aria.Listbox.prototype.findItemToFocus = function (key) {
	var itemList = this.listboxNode.querySelectorAll('[role="option"]');
	var character = String.fromCharCode(key);

	if (!this.keysSoFar) {
		for (var i = 0; i < itemList.length; i++) {
			if (itemList[i].getAttribute('id') == this.activeDescendant) {
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

aria.Listbox.prototype.clearKeysSoFarAfterDelay = function () {
	if (this.keyClear) {
		clearTimeout(this.keyClear);
		this.keyClear = null;
	}
	this.keyClear = setTimeout((function () {
		this.keysSoFar = '';
		this.keyClear = null;
	}).bind(this), 500);
};

aria.Listbox.prototype.findMatchInRange = function (list, startIndex, endIndex) {
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
 * @desc
 *  Check if an item is clicked on. If so, focus on it and select it.
 *
 * @param evt
 *  The click event object
 */
aria.Listbox.prototype.checkClickItem = function (evt) {
	if (evt.target.getAttribute('role') === 'option') {
		this.focusItem(evt.target);
	}
};

/**
 * @desc
 *  Defocus the specified item
 *
 * @param element
 *  The element to defocus
 */
aria.Listbox.prototype.defocusItem = function (element) {
	if (!element) {
		return;
	}

	element.classList.remove('focused');
};

/**
 * @desc
 *  Focus on the specified item
 *
 * @param element
 *  The element to focus
 */
aria.Listbox.prototype.focusItem = function (element) {
	this.defocusItem(document.getElementById(this.activeDescendant));
	element.classList.add('focused');
	this.listboxNode.setAttribute('aria-activedescendant', element.id);
	this.activeDescendant = element.id;

	if (this.listboxNode.scrollHeight > this.listboxNode.clientHeight) {
		var scrollBottom = this.listboxNode.clientHeight + this.listboxNode.scrollTop;
		var elementBottom = element.offsetTop + element.offsetHeight;
		if (elementBottom > scrollBottom) {
			this.listboxNode.scrollTop = elementBottom - this.listboxNode.clientHeight;
		}
		else if (element.offsetTop < this.listboxNode.scrollTop) {
			this.listboxNode.scrollTop = element.offsetTop;
		}
	}

	this.handleFocusChange(element);
};

aria.Listbox.prototype.setHandleFocusChange = function (focusChangeHandler) {
	this.handleFocusChange = focusChangeHandler;
	this.setupFocus();
};
