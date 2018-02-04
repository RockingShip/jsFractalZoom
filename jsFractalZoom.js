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
	this.width = 1;
	this.height = 1;

	this.msecPerFrame = 1000 / this.framerate;
}

/*
 * improved base64 (word based)
 */
function GifEncoder(width, height) {

	/*
	 * Allocate (worstcase) persistent storage for result
	 *
	 * worst case uncompressed (8bpp) uses 1810 24bit words for 3839 pixels
	 */

	this.out_store = new Uint32Array(
		Math.floor(29 / 3) + // headers
		256 + // colormap
		(Math.floor(width * height / 3838) + 1) * 1811 + // pixels
		32 // unforeseen
	);

	/**
	 * Precalculate 2 adjacent base64 characters (2*6 bits = 4096 combos)
	 *
	 * @type {string[]}
	 */
	this.base64Pair = new Array(4096);

	var base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	for (var i=0; i<4096; i++)
		this.base64Pair[i] = base64Chars[(i >> 6) & 63] + base64Chars[(i >> 0) & 63];

	/**
	 * Encode
	 *
	 * @param bpp {number} - bits per pixel (max 8 for 256 colours)
	 * @param red {number[]} - red palette
	 * @param green {number[]} - green palette
	 * @param blue {number[]} - blue palette
	 * @param pixels {number[]} - color indexed pixel data
	 * @returns {string} - result
	 */
	this.encode = function(bpp, red, green, blue, pixels) {
		var n_bits = bpp + 1;
		var maxcode = (1 << n_bits) - 1;
		var CLRcode = 1 << bpp;
		var EOFcode = CLRcode + 1;
		var curcode = CLRcode + 2;
		var out_accum = 0;
		var out_bits = 0;
		var out_len = 0;
		var out_store = this.out_store;
		var i, j, v;

		/**
		 * Slow function (only used for headers) to add byte
		 *
		 * @param v
		 */
		var putByte = function (v) {
			out_accum |= v << out_bits;
			if ((out_bits += 8) >= 24) {
				out_store[out_len++] = out_accum;
				out_accum = v >> (8 - (out_bits -= 24));
			}
		};

		/**
		 * Slow function (only used for headers) to add word
		 *
		 * @param v
		 */
		var putWord = function (v) {
			putByte(v & 255);
			putByte(v >> 8);
		};

		// Write the Magic header
		putByte(71); // G
		putByte(73); // I
		putByte(70); // F
		putByte(56); // 8
		putByte(57); // 9
		putByte(97); // a

		// Write out the screen width and height
		putWord(width);
		putWord(height);

		// global colour map | color resolution | Bits per Pixel
		putByte(128 | (bpp - 1) << 4 | (bpp - 1));

		// Write out the Background colour
		putByte(0);

		// Byte of 0's (future expansion)
		putByte(0);

		this.cycle = this.cycle || 0;
		this.cycle++;

		// Write out the Global Colour Map
		for (i = 0; i < CLRcode; ++i) {
			j = (this.cycle+i)%16;
			putByte(red[j]);
			putByte(green[j]);
			putByte(blue[j]);
		}

		// Write an Image separator
		putByte(44);

		// Write the Image header
		putWord(0); // left
		putWord(0); // top
		putWord(width);
		putWord(height);

		// Write out whether or not the image is interlaced
		putByte(0);

		// Write out the initial code size
		putByte(bpp);

		// mark
		var mark = out_len;
		out_accum |= 254;
		out_bits += 8;

		// place CLR in head of compressed stream
		var str = CLRcode;
		curcode--; // compensate for lack of previous symbol
		var hash = new Uint16Array(4096);

		// compress frame
		for (var xy = 0; xy < width * height; xy++) {
			var c = pixels[xy];

			var fcode = (c << 12) | str;
			if ((v = hash[fcode])) {
				str = v;
			} else {
				v = str;
				out_accum |= v << out_bits;
				if ((out_bits += n_bits) >= 24) {
					out_store[out_len++] = out_accum;
					out_accum = v >> (n_bits - (out_bits -= 24));

					if ((v = out_len - mark) >= 85) {
						mark = out_len;
						out_accum <<= 8;
						out_accum |= 254;
						out_bits += 8;
					}
				}

				str = c;

				if (curcode < 4096) {
					hash[fcode] = curcode;
					if (curcode++ > maxcode)
						maxcode = (1 << ++n_bits) - 1;
				} else {
					// CLEAR
					v = CLRcode;
					out_accum |= v << out_bits;
					if ((out_bits += n_bits) >= 24) {
						out_store[out_len++] = out_accum;
						out_accum = v >> (n_bits - (out_bits -= 24));

						if ((v = out_len - mark) >= 85) {
							mark = out_len;
							out_accum <<= 8;
							out_accum |= 254;
							out_bits += 8;
						}
					}

					// reset codes
					n_bits = bpp + 1;
					maxcode = (1 << n_bits) - 1;
					curcode = CLRcode + 2;
					hash = new Uint16Array(4096);
				}
			}
		}

		// last code
		v = str;
		out_accum |= v << out_bits;
		if ((out_bits += n_bits) >= 24) {
			out_store[out_len++] = out_accum;
			out_accum = v >> (n_bits - (out_bits -= 24));

			if ((v = out_len - mark) >= 85) {
				mark = out_len;
				out_accum <<= 8;
				out_accum |= 254;
				out_bits += 8;
			}
		}

		// EOF
		v = EOFcode;
		out_accum |= v << out_bits;
		if ((out_bits += n_bits) >= 24) {
			out_store[out_len++] = out_accum;
			out_accum = v >> (n_bits - (out_bits -= 24));

			if ((v = out_len - mark) >= 85) {
				mark = out_len;
				out_accum <<= 8;
				out_accum |= 254;
				out_bits += 8;
			}
		}

		if (mark === out_bits && out_bits === 8) {
			// undo mark
			out_accum >>= 8;
			out_bits -= 8;
		} else {
			// FLUSH
			v = (out_len - mark) * 3 - 1;
			if (out_bits > 16) {
				out_bits = 24;
				v += 3;
				out_store[out_len++] = out_accum;
				out_bits = out_accum = 0;
			} else if (out_bits > 8) {
				out_bits = 16;
				v += 2;
			} else if (out_bits > 0) {
				out_bits = 8;
				v += 1;
			}
			out_store[mark] &= ~255;
			out_store[mark] |= v;
		}

		// Write out a Zero-length packet (to end the series)
		putByte(0);

		// Write the GIF file terminator
		putByte(59);

		// fast flush
		putByte(0);
		putByte(0);
		putByte(0);

		// export as base64
		var res = new Array(out_len * 2 + 1);
		j = 0;
		res[j++] = "data:image/gif;base64,";
		for (i = 0; i < out_len; i++) {
			v = out_store[i];
			res[j++] = this.base64Pair[((v & 0x0000ff) << 4) | ((v & 0x00f000) >> 12)];
			res[j++] = this.base64Pair[((v & 0x000f00) << 0) | ((v & 0xff0000) >> 16)];
		}

		// return with appropriate header
		return  res.join('');
	}

}

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
	this.domMain = 'main';
	this.domStatusQuality = 'idStatusQuality';
	this.domStatusLoad = 'idStatusLoad';
	this.domStatusRect = 'idStatusRect';
	this.domPowerButton = 'idPowerButton';
	this.domAutoPilotButton = 'idAutoPilotButton';
	this.domHomeButton = 'idHomeButton';
	this.domFormulaButton = 'idFormulaButton';
	this.domFormulaList = 'idFormulaList';
	this.domIncolourButton = 'idIncolourButton';
	this.domIncolourList = 'idIncolourList';
	this.domOutcolourButton = 'idOutcolourButton';
	this.domOutcolourList = 'idOutcolourList';
	this.domPlaneButton = 'idPlaneButton';
	this.domPlaneList = 'idPlaneList';
	this.domSpeedLeft = 'idSpeedLeft';
	this.domSpeedRail = 'idSpeedRail';
	this.domSpeedThumb = 'idSpeedThumb';
	this.domRotateLeft = 'idRotateLeft';
	this.domRotateRail = 'idRotateRail';
	this.domRotateThumb = 'idRotateThumb';
	this.domCycleLeft = 'idCycleLeft';
	this.domCycleRail = 'idCycleRail';
	this.domCycleThumb = 'idCycleThumb';
	this.domRandomPaletteButton = 'idRandomPaletteButton';
	this.domDefaultPaletteButton = 'idDefaultPaletteButton';
	this.domDepthLeft = 'idDepthLeft';
	this.domDepthRail = 'idDepthRail';
	this.domDepthThumb = 'idDepthThumb';
	this.domFramerateLeft = 'idFramerateLeft';
	this.domFramerateRail = 'idFramerateRail';
	this.domFramerateThumb = 'idFramerateThumb';
	this.domWxH = 'WxH';

	/** @type {number} - Main loop timer id */
	this.timerId = 0;
	/** @type {number} - Timestamp next vblank */
	this.vblank = 0;

	/** @type {number} - Damping coefficient low-pass filter for following fields */
	this.coef = 0.05;
	/** @type {number} - Average time in mSec spent in DOM/JS framework */
	this.msecSys = 0;
	/** @type {number} - Average time in mSec spent in jsFractalZoom framework */
	this.msecUsr = 0;
	/** @type {number} - Average time in mSec spent in stage1 (GIF) */
	this.msecState1 = 0;
	/** @type {number} - Average time in mSec spent in stage2 (Zoom) */
	this.msecState2 = 0;
	/** @type {number} - Average time in mSec spent in stage3 (Lines) */
	this.msecState3 = 0;

	/*
	 * gif encoder
	 */
	/** @type {GifEncoder} - Encoder */
	this.gifencoder = undefined;

	/*
	 * Find the elements and replace the string names for DOM references
	 */
	for (var property in this) {
		if (this.hasOwnProperty(property) && property.substr(0,3) === 'dom') {
			this[property] = document.getElementById(this[property]);
		}
	}

	/*
	 * create encoder
	 */
	this.config.width = this.domMain.clientWidth;
	this.config.height = this.domMain.clientHeight;
	this.domWxH.innerHTML = '['+this.config.width+'x'+this.config.height+']';

	this.gifencoder = new GifEncoder(this.config.width, this.config.height);
	this.pixels = new Uint8Array(this.config.width * this.config.height);
	this.image = document.createElement('img');
	this.image.width = this.config.width;
	this.image.height = this.config.height;
	this.domMain.width = this.config.width; // set canvas property or drawImage() resamples everything
	this.domMain.height = this.config.height;
	this.paletteRed = [230, 135, 75, 254, 255, 246, 223, 255, 255, 197, 255, 255, 214, 108, 255, 255];
	this.paletteGreen = [179, 135, 75, 203, 244, 246, 223, 212, 224, 146, 235, 247, 214, 108, 255, 255];
	this.paletteBlue = [78, 135, 75, 102, 142, 246, 223, 111, 123, 45, 133, 145, 214, 108, 153, 255];
	this.ctx = this.domMain.getContext("2d");
	this.ctx.imageSmoothingEnabled = false; // disable anti aliasing
	for (var i=0; i<this.config.width*this.config.height; i++)
		this.pixels[i] = (i)%16;

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

	// replace static mainloop with a bound instance
	this.mainloop = this.mainloop.bind(this);

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
		self.config.msecPerFrame = 1000 / self.config.framerate;
		self.domFramerateLeft.innerHTML = newValue;
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
		/*
		 * toggle mainloop
		 */
		if (newValue)
			self.start();
		else
			self.stop();
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

/**
 * Handle focus event
 *
 * @param {FocusEvent} event
 */
GUI.prototype.handleFocus = function (event) {
	this.domMain.classList.add('focus');
};

/**
 * Handle blur event
 *
 * @param {FocusEvent} event
 */
GUI.prototype.handleBlur = function (event) {
	this.domMain.classList.remove('focus');
};

/**
 * start the mainloop
 */
GUI.prototype.start = function() {
	this.vblank = Date.now() + this.config.msecPerFrame; // vblank wakeup time
	this.msecState1 = this.msecState2 = this.msecState3 = this.config.msecPerFrame / 2;
	this.timerId = window.setTimeout(this.mainloop, 1);
};

/**
 * stop the mainloop
 */
GUI.prototype.stop = function() {
	this.state = 0; // stop
	clearTimeout(this.timerId);
	this.timerId = null;
};

/**
 * GUI mainloop called by timer event
 *
 * @returns {boolean}
 */
GUI.prototype.mainloop = function() {
	if (!this.timerId)
		return false;

	// current time
	var now = Date.now();

	// consider waking too late is framework overloaded
	var sysload = Math.max(now-this.vblank, 0);
	this.msecSys += (sysload - this.msecSys) * this.coef;

	// update vertical blank
	if (this.vblank + 2000 <= now) {
		// hibernated too long (like when stepping during debugging)
		this.vblank = now + this.config.msecPerFrame; // time of next vblank
	} else {
		this.vblank += this.config.msecPerFrame; // update next vblank
	}

	// endtime based on framerate and 2 mSec framework breathing space
	var endtime = this.vblank + this.config.msecPerFrame - 2;

	// last = now;
	// now = getTime();

	// if (uiEngine.resizing) {
	// 	reftime += config.msecPerFrame;
	// 	tid = window.setTimeout(mainloop, Math.max(reftime-now,1));
	// 	return;
	// }

	// var sysload = Math.max(now-reftime, 0);
	// var usrload = now;
	// var avg1 = (stats1[0]+stats1[1]+stats1[2]+stats1[3]+stats1[4]) / 5;
	// var avg2 = (stats2[0]+stats2[1]+stats2[2]+stats2[3]+stats2[4]) / 5;
	// var avg3 = (stats3[0]+stats3[1]+stats3[2]+stats3[3]+stats3[4]) / 5;
	// var avg4 = (stats4[0]+stats4[1]+stats4[2]+stats4[3]+stats4[4]) / 5;
	// var m = timeslice-sysload;
	// avg1 = Math.min(avg1,m);
	// avg2 = Math.min(avg2,m);
	// avg3 = Math.min(avg3,m);
	// avg4 = Math.min(avg4,m);
	// var stxt = avg1.toFixed()+' '+avg2.toFixed()+' '+avg3.toFixed()+' '+avg4.toFixed();

	// timer dependent updates
	// uiEngine.ontick(now, endtime);
	// if (config.cyclingspeed) {
	// 	config.cycle += (now-last) * config.cyclinginc * config.cyclingspeed;
	// 	changed = true;
	// }
	// if (config.rotatespeed) {
	// 	navEngine.setangle(config.angle + (now-last) * config.rotateinc * config.rotatespeed);
	// 	changed = true;
	// }

	var usrload = now;
	var last = now;
	var diff = undefined;

	/*
	 * Create GIF image
	 */
	{

		var data = this.gifencoder.encode(4, this.paletteRed, this.paletteGreen, this.paletteBlue, this.pixels);
		this.image.src = data;
		this.ctx.drawImage(this.image, 0, 0, this.image.width, this.image.height);

		now = Date.now();
		diff = now - last;
		this.msecState1 += (diff - this.msecState1) * this.coef;
		last = now;
	}

	/*
	 * zoom/autopilot
	 */
	{
//		navEngine.ontick(now, endtime);

		now = Date.now();
		diff = now - last;
		this.msecState2 += (diff - this.msecState2) * this.coef;
		last = now;
	}

	/*
	 * redraw as many as possible scanlines
	 * but no more than 20 scanlines
	 */
	var numLines = 0;
	var moreTodo = false;
	while (now < endtime) {
		// var cnt = navEngine.onquality(now, endtime-avg4);

		// when all scanlines done, then image complete
		this.dirty = true;

		now = Date.now();
		numLines++;
	}
	if (numLines > 0) {
		diff = (now - last) / numLines;
		this.msecState3 += (diff - this.msecState3) * this.coef;
	}

	// update load
	usrload = now - usrload;
	this.msecUsr += (usrload - this.msecUsr) * this.coef;

	// this.domMain.innerHTML = ((avgS+avgU)*100/config.frametime).toFixed()+'% (sys:'+avgS.toFixed()+'mSec+usr:'+avgU.toFixed()+'mSec) ['+stxt+']';
	this.domStatusRect.innerHTML = ((this.msecSys + this.msecUsr) * 100 / this.config.msecPerFrame).toFixed() +
		'% (sys:' + this.msecSys.toFixed() +
		'mSec+usr:' + this.msecUsr.toFixed() +
		'mSec) [' + this.msecState1.toFixed(3) +
		',' +  this.msecState2.toFixed(6) +
		',' +  this.msecState3.toFixed(6) +
		']';

	if (moreTodo) {
		// more to do, sleep as short as possible
		this.timerId = window.setTimeout(this.mainloop, 0);
	} else {
		// wait until next vertical blank
		this.timerId = window.setTimeout(this.mainloop, Math.max(this.vblank - now, 0));
	}

	return true;
};
