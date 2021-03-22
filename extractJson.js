/*
 * This code extracts the JSON embedded in PNG images.
 * It contains the settings to reproduce the image.
 */
/*
 *  This file is part of jsFractalZoom - Fractal zoomer and splash video codec
 *
 *  Copyright (C) 2020, xyzzy@rockingship.org
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

"use strict";

const {createCanvas, loadImage} = require('canvas');

loadImage(process.argv[2]).catch(e => {
	console.log("failed to load image");
}).then((image) => {

	// create canvas
	const canvas = createCanvas(image.width, image.height);
	const ctx = canvas.getContext('2d');

	ctx.strokeStyle = "#00000000"; // transparent
	ctx.fillStyle = "#00000000";
	ctx.fillRect(0, 0, image.width, image.height);

	// draw image on canvas
	ctx.drawImage(image, 0, 0, image.width, image.height);

	// get pixel data
	const rgba = new Uint32Array(ctx.getImageData(0, 0, image.width, image.height).data.buffer);

	let json = "";

	// skip first line and column
	let k = image.width + 1;
	while (k < image.width * image.height) {
		let code = 0;
		for (let i = 0; i < 8; i++) {
			// pixel must not be transparent
			while (!(rgba[k] & 0xff000000) && k < image.width * image.height)
				k++;

			code |= (rgba[k++] & 1) << i;
		}

		if (code < 32 || code >= 128) {
			// invalid code
			json = "";
		} else if (json.length === 0) {
			if (code === 123 /* '{' */) {
				// sequence starter
				json = "{";
			}
		} else if (code === 125 /* '}' */) {
			// string complete
			json += '}';

		// test that it has a bit of body
		if (json.length > 16)
			break;
		} else {
			// add character
			json += String.fromCharCode(code);
		}
	}

	if (!json) {
		console.log("No json found");
		process.exit();
	}

	console.log(json);

	// decode json
	const config = JSON.parse(json);

	// convert to query string
	let qarr = [];
	for (let k in config) {
		qarr.push(k+'='+config[k]);
	}
	let qstr = qarr.join("&");

	console.log("https://rockingship.github.io/jsFractalZoom?" + qstr);
});
