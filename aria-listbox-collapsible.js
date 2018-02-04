/**
 * ARIA Collapsible Dropdown Listbox Example
 * @function onload
 * @desc Initialize the listbox example once the page has loaded
 */

var aria = aria || {};

aria.KeyCode = Object.freeze({
	'BACKSPACE': 8,
	'RETURN': 13,
	'ESC': 27,
	'SPACE': 32,
	'PAGE_UP': 33,
	'PAGE_DOWN': 34,
	'END': 35,
	'HOME': 36,
	'LEFT': 37,
	'UP': 38,
	'RIGHT': 39,
	'DOWN': 40,
	'DELETE': 46
});

aria.ListboxButton = function (button, listbox) {
	this.button = button;
	this.listbox = listbox;
	this.registerEvents();
	this.button.setAttribute('tabindex', '0');
};

aria.ListboxButton.prototype.registerEvents = function () {
	this.button.addEventListener('click', this.toggleListbox.bind(this));
	this.button.addEventListener('keyup', this.checkShow.bind(this));
	this.listbox.listboxNode.addEventListener('blur', this.hideListbox.bind(this));
	this.listbox.listboxNode.addEventListener('keydown', this.checkHide.bind(this));

	this.button.addEventListener('focus', this.handleFocus.bind(this));
	this.button.addEventListener('blur', this.handleBlur.bind(this));
};
aria.ListboxButton.prototype.handleFocus = function (event) {
	this.button.classList.add('focus');
};
aria.ListboxButton.prototype.handleBlur = function (event) {
	this.button.classList.remove('focus');
};

aria.ListboxButton.prototype.keyToggle = function (evt) {
	if (this.listbox.listboxNode.classList.contains('hidden')) {
		this.showListbox(evt);
		return true;
	} else {
		this.hideListbox(evt);
		return false;
	}
};

aria.ListboxButton.prototype.checkShow = function (evt) {
	var key = evt.which || evt.keyCode;

	switch (key) {
		case aria.KeyCode.UP:
		case aria.KeyCode.DOWN:
			evt.preventDefault();
			this.showListbox();
			this.listbox.checkKeyPress(evt);
			break;
	}
};

aria.ListboxButton.prototype.checkHide = function (evt) {
	var key = evt.which || evt.keyCode;

	switch (key) {
		case aria.KeyCode.RETURN:
		case aria.KeyCode.ESC:
			evt.preventDefault();
			this.hideListbox();
			this.button.focus();
			break;
	}
};

// reclicking the button will blur the dropdown causing it to hide, causing the click to make it reappear again
aria.ListboxButton.prototype.toggleListbox = function () {
	if (this.listbox.listboxNode.classList.contains('hidden')) {
		this.listbox.listboxNode.classList.remove('hidden');
		this.button.setAttribute('aria-expanded', 'true');
		this.listbox.listboxNode.focus();
	} else {
		this.listbox.listboxNode.classList.add('hidden');
		this.button.removeAttribute('aria-expanded');

	}
};

aria.ListboxButton.prototype.showListbox = function () {
	this.listbox.listboxNode.classList.remove('hidden');
	this.button.setAttribute('aria-expanded', 'true');
	this.listbox.listboxNode.focus();
};

aria.ListboxButton.prototype.hideListbox = function (event) {
	// clicking the button is a close gesture
	if (event.relatedTarget === this.button)
		return;

	this.listbox.listboxNode.classList.add('hidden');
	this.button.removeAttribute('aria-expanded');
};
