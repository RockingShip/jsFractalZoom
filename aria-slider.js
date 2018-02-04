/*
*   This content is licensed according to the W3C Software License at
*   https://www.w3.org/Consortium/Legal/2015/copyright-software-and-document
*
*   File:   slider.js
*
*   Desc:   Slider widget that implements ARIA Authoring Practices
*/

// Create Slider that contains value, valuemin, valuemax, and valuenow
var Slider = function (domThumb, domRail, domText) {

	this.domNode = domThumb;
	this.railDomNode = domRail;
	this.valueDomNode = domText;

	this.valueMin = 0;
	this.valueMax = 100;
	this.valueNow = 50;

	this.railWidth = 0;

	this.thumbWidth = domThumb.clientWidth;
	this.thumbHeight = domThumb.clientHeight;

	var rect = this.railDomNode.getBoundingClientRect();
	this.railWidth = rect.right - rect.left + 1;

	this.keyCode = Object.freeze({
		'ESC': 27,
		'left': 37,
		'up': 38,
		'right': 39,
		'down': 40,
		'pageUp': 33,
		'pageDown': 34,
		'end': 35,
		'home': 36
	});

	if (this.domNode.getAttribute('aria-valuemin')) {
		this.valueMin = parseInt((this.domNode.getAttribute('aria-valuemin')));
	}
	if (this.domNode.getAttribute('aria-valuemax')) {
		this.valueMax = parseInt((this.domNode.getAttribute('aria-valuemax')));
	}
	if (this.domNode.getAttribute('aria-valuenow')) {
		this.valueNow = parseInt((this.domNode.getAttribute('aria-valuenow')));
	}

	if (this.valueDomNode) {
		this.valueDomNode.innerHTML = '0';
		// this.valueDomNode.style.left = (this.railDomNode.offsetLeft + this.railWidth + 10) + 'px';
		// this.valueDomNode.style.top = (this.railDomNode.offsetTop - 8) + 'px';
	}

	if (this.domNode.tabIndex != 0) {
		this.domNode.tabIndex = 0;
	}

	this.railDomNode.addEventListener('keydown', this.handleKeyDown.bind(this));
	// add onmousedown, move, and onmouseup
	this.domNode.addEventListener('mousedown', this.handleMouseDown.bind(this));

	this.domNode.addEventListener('focus', this.handleFocus.bind(this));
	this.domNode.addEventListener('blur', this.handleBlur.bind(this));

	this.railDomNode.addEventListener('mousedown', this.handleClick.bind(this));

	this.moveSliderTo(this.valueNow);
};

Slider.prototype.moveSliderTo = function (value) {

	if (value > this.valueMax) {
		value = this.valueMax;
	}

	if (value < this.valueMin) {
		value = this.valueMin;
	}

	this.valueNow = value;

	this.domNode.setAttribute('aria-valuenow', this.valueNow);

	var pos = Math.round(
		(this.valueNow * this.railWidth) / (this.valueMax - this.valueMin)
	) - (this.thumbWidth / 2);

	this.domNode.style.left = pos + 'px';

	if (this.valueDomNode) {
		this.valueDomNode.innerHTML = this.valueNow.toString();
	}

	// updateColorBox();

};

Slider.prototype.handleKeyDown = function (event) {

	var flag = false;

	switch (event.keyCode) {
		case this.keyCode.left:
		case this.keyCode.down:
			this.moveSliderTo(this.valueNow - 1);
			flag = true;
			break;

		case this.keyCode.right:
		case this.keyCode.up:
			this.moveSliderTo(this.valueNow + 1);
			flag = true;
			break;

		case this.keyCode.pageDown:
			this.moveSliderTo(this.valueNow - 10);
			flag = true;
			break;

		case this.keyCode.pageUp:
			this.moveSliderTo(this.valueNow + 10);
			flag = true;
			break;

		case this.keyCode.home:
			this.moveSliderTo(this.valueMin);
			flag = true;
			break;

		case this.keyCode.end:
			this.moveSliderTo(this.valueMax);
			flag = true;
			break;

		default:
			break;
	}

	if (flag) {
		event.preventDefault();
		event.stopPropagation();
	}

};

Slider.prototype.handleFocus = function (event) {
	this.domNode.classList.add('focus');
	this.railDomNode.classList.add('focus');
};

Slider.prototype.handleBlur = function (event) {
	this.domNode.classList.remove('focus');
	this.railDomNode.classList.remove('focus');
};

Slider.prototype.handleMouseDown = function (event) {

	var self = this;

	var handleMouseMove = function (event) {

		var rect = self.railDomNode.getBoundingClientRect();
		var diffX = event.pageX - rect.left;
		self.valueNow = parseInt(((self.valueMax - self.valueMin) * diffX) / self.railWidth);
		self.railWidth = rect.right - rect.left + 1;
		self.moveSliderTo(self.valueNow);

		event.preventDefault();
		event.stopPropagation();

		// Set focus to the clicked handle
		self.domNode.focus();
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

	// Set focus to the clicked handle
	self.domNode.focus();

};

// handleMouseMove has the same functionality as we need for handleMouseClick on the rail
Slider.prototype.handleClick = function (event) {

	var rect = this.railDomNode.getBoundingClientRect();
	var diffX = event.pageX - rect.left;
	this.valueNow = parseInt(((this.valueMax - this.valueMin) * diffX) / this.railWidth);
	this.railWidth = rect.right - rect.left + 1;
	this.moveSliderTo(this.valueNow);

	event.preventDefault();
	event.stopPropagation();

	// Set focus to the clicked handle
	this.domNode.focus();
};
