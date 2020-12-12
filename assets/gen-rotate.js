/*
 *  This file is part of jsFractalZoom - Fractal zoomer and splash video codec
 *
 *  Copyright (C) 2018, xyzzy@rockingship.org
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


// ffmpeg -loglevel warning -i gallery/demo-06b.png -vf crop=in_h:in_h,scale=400:400 rotate-col.png
// ffmpeg -loglevel warning -i rotate-col.png -vf hue=s=0 rotate-bw.png

const nodeFs = require('fs');
const nodeCanvas = require('canvas');

// load image
let imgBW = new nodeCanvas.Image;
imgBW.src = "rotate-bw.png";
let imgCol = new nodeCanvas.Image;
imgCol.src = "rotate-col.png";

for (let iangle = 0; iangle < 45; iangle++) {
	// create canvas
	let canvas = nodeCanvas.createCanvas(imgBW.width, imgBW.height);
	let ctx = canvas.getContext('2d');

	// paste blurred image
	ctx.globalAlpha = 1 / 9;
	for (let y = -2; y < 3; y++)
		for (let x = -2; x < 3; x++)
			ctx.drawImage(imgBW, x, y);
	ctx.globalAlpha = 1.0;

	const angle = iangle * 360/90; // rectangle will rotate anti-clockwise, but viewport relative, the image will rotate clockwise.
	const pixelWidth = imgBW.width;
	const pixelHeight = imgBW.height;
	const viewWidth = 348;
	const viewHeight = 194; // 348^2 + 194^2 is just under 400

	const rsin = Math.sin(angle * Math.PI / 180); // sine for view angle
	const rcos = Math.cos(angle * Math.PI / 180); // cosine for view angle
	let xstart = Math.floor((pixelWidth  + viewHeight * rsin - viewWidth * rcos) / 2);
	let ystart = Math.floor((pixelHeight + viewHeight * rcos + viewWidth * rsin) / 2);

	console.log(xstart, ystart);

	// clip angled rectangle
	if (1) {
		ctx.save();
		ctx.beginPath();
		ctx.moveTo((pixelWidth  - viewHeight * rsin - viewWidth * rcos) / 2, (pixelHeight - viewHeight * rcos + viewWidth * rsin) / 2);
		ctx.lineTo((pixelWidth  - viewHeight * rsin + viewWidth * rcos) / 2, (pixelHeight - viewHeight * rcos - viewWidth * rsin) / 2);
		ctx.lineTo((pixelWidth  + viewHeight * rsin + viewWidth * rcos) / 2, (pixelHeight + viewHeight * rcos - viewWidth * rsin) / 2);
		ctx.lineTo((pixelWidth  + viewHeight * rsin - viewWidth * rcos) / 2, (pixelHeight + viewHeight * rcos + viewWidth * rsin) / 2);
		ctx.lineTo((pixelWidth  - viewHeight * rsin - viewWidth * rcos) / 2, (pixelHeight - viewHeight * rcos + viewWidth * rsin) / 2);
		ctx.clip();
		// draw image
		ctx.drawImage(imgCol, 0, 0);
		ctx.restore();
	}

	ctx.beginPath();
	ctx.moveTo((pixelWidth  - viewHeight * rsin - viewWidth * rcos) / 2, (pixelHeight - viewHeight * rcos + viewWidth * rsin) / 2);
	ctx.lineTo((pixelWidth  - viewHeight * rsin + viewWidth * rcos) / 2, (pixelHeight - viewHeight * rcos - viewWidth * rsin) / 2);
	ctx.lineTo((pixelWidth  + viewHeight * rsin + viewWidth * rcos) / 2, (pixelHeight + viewHeight * rcos - viewWidth * rsin) / 2);
	ctx.lineTo((pixelWidth  + viewHeight * rsin - viewWidth * rcos) / 2, (pixelHeight + viewHeight * rcos + viewWidth * rsin) / 2);
	ctx.lineTo((pixelWidth  - viewHeight * rsin - viewWidth * rcos) / 2, (pixelHeight - viewHeight * rcos + viewWidth * rsin) / 2);

	// ctx.lineTo(200,150);
	// ctx.fillStyle = "#f00";
	// ctx.fill();
	ctx.lineWidth = 5;
	ctx.strokeStyle = "black";
	ctx.stroke();

	// write
	let buffer = canvas.toBuffer('image/png');
	nodeFs.writeFileSync('rotate2-'+iangle+'.png', buffer);
}

// ffmpeg -loglevel warning -r 15 -i rotate2-%d.png -qscale 85 rotate.webp
