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
	This code is directly inspired by XaoS which has GNU version 2 license.
 */

function Formula() {

	Formula.initial = [
		{x: -0.75, y: 0.0, r: 2.5, a: 0},
		{x: 0.0, y: 0.0, r: 2.5, a: 0},
		{x: 0.0, y: 0.0, r: 2.5, a: 0},
		{x: 0.0, y: 0.0, r: 2.5, a: 0},
		{x: 0.0, y: 0.0, r: 2.5, a: 0},
		{x: 0.0, y: 0.0, r: 2.5, a: 0},
		{x: 0.0, y: 0.0, r: 2.5, a: 0},
		{x: 0.0, y: 0.0, r: 3.5, a: 0},
		{x: 0.0, y: 0.0, r: 3.5, a: 0},
		{x: 0.0, y: 0.0, r: 3.0, a: 0},
		{x: 1.5, y: 0.0, r: 6.0, a: 0},
		{x: 1.5, y: 0.0, r: 4.0, a: 0}
	];

	Formula.formula = 0;
	Formula.formulaNames = [
		"mandelbrot",
		"mandelbrot^3",
		"mandelbrot^4",
		"mandelbrot^5",
		"mandelbrot^6",
		"octal",
		"newton",
		"barnsley1",
		"barnsley2",
		"phoenix",
		"magnet1",
		"magnet2"
	];

	Formula.incolour = 0;
	Formula.incolourNames = [
		"maxiter",
		"zmag",
		"decomposition-like",
		"real/imag",
		"mag*cos(real^2)",
		"sin(real^2-imag^2)",
		"atan(real*imag*creal*cimag)",
		"squares"
	];

	Formula.outcolour = 0;
	Formula.outcolourNames = [
		"iter",
		"iter+real",
		"iter+imag",
		"iter+real/imag",
		"iter+real+imag+real/imag",
		"binary decomposition",
		"biomorphs",
		"potential",
		"color decomposition"
	];
	Formula.plane = 0;
	Formula.planeNames = [
		"mu",
		"1/mu",
		"1/(mu+0.25)",
		"lambda",
		"1/lambda",
		"1/(lambda-1)",
		"1/(mu-1.40115)"
	];

	/**
	 *
	 * @param {number} x
	 * @param {number} y
	 * @returns {number}
	 */
	Formula.calculate = function (x, y) {

		if (Formula.plane) {
			switch (Formula.plane) {
			case 1: // 1/mu
				var t = x * x + y * y;
				if (t < 0.000001) {
					x = 1e9;
					y = 1e9;
				} else {
					x /= t;
					y /= -t;
				}
				break;
			case 2: // 1/(mu + 0.25)
				var t = x * x + y * y;
				if (t < 0.000001) {
					x = 1e9;
					y = 1e9;
				} else {
					x /= t;
					y /= -t;
				}
				x += 0.25;
				break;
			case 3: // lambda
				var tr = x * x - y * y;
				var ti = x * y;
				x = (x - tr / 2) / 2;
				y = (y - ti) / 2;
				break;
			case 4: // 1/lambda
				var t = x * x + y * y;
				x /= t;
				y /= -t;
				var tr = x * x - y * y;
				var ti = x * y;
				x = (x - tr / 2) / 2;
				y = (y - ti) / 2;
				break;
			case 5: // 1/(lambda-1)
				var t = x * x + y * y;
				x /= t;
				y /= -t;
				x += 1;
				var tr = x * x - y * y;
				var ti = x * y;
				x = (x - tr / 2) / 2;
				y = (y - ti) / 2;
				break;
			case 6: // 1/(mu - 1.40115)
				var t = x * x + y * y;
				if (t < 0.000001) {
					x = 1e9;
					y = 1e9;
				} else {
					x /= t;
					y /= -t;
				}
				x -= 1.40115;
				break;
			}
		}

		switch (Formula.formula) {
		case 0: // mandelbrot

			/*
			 * original code:
			 *	do {
			 *		rp = zre * zre;
			 *		ip = zim * zim;
			 *
			 *		zim = 2 * zre * zim + pim;
			 *		zre = rp - ip + pre;
			 *		if (rp + ip >= 4)
			 *			return iter;
			 *	} while (++iter < maxiter);
			 */

			var maxIter = Config.maxIter;
			var iter = 0;
			var zre = x;
			var zim = y;
			var pre = x;
			var pim = y;

			do {
				var rp3 = zre * zre;
				var ip3 = zim * zim;
				var zim3 = zre * zim * 2 + pim;
				var zre3 = rp3 - ip3 + pre;

				var rp2 = zre3 * zre3;
				var ip2 = zim3 * zim3;
				var zim2 = zre3 * zim3 * 2 + pim;
				var zre2 = rp2 - ip2 + pre;

				var rp1 = zre2 * zre2;
				var ip1 = zim2 * zim2;
				var zim1 = zre2 * zim2 * 2 + pim;
				var zre1 = rp1 - ip1 + pre;

				var rp = zre1 * zre1;
				var ip = zim1 * zim1;
				zim = zre1 * zim1 * 2 + pim;
				zre = rp - ip + pre;
			} while (rp + ip < 4 && ++iter <= maxIter);

			iter *= 4;

			if (iter <= maxIter && Config.maxIter < iter + 100)
				Config.maxIter += Math.round((iter + 100 - Config.maxIter) * 0.01); // increase maxIter with low-pass filter

			if (rp3 + ip3 >= 4)
				return Formula.outcolour ? Formula.calc_outcolour(zre3, zim3, pre, pim, iter) : iter;
			if (rp2 + ip2 >= 4)
				return Formula.outcolour ? Formula.calc_outcolour(zre2, zim2, pre, pim, iter + 1) : iter + 1;
			if (rp1 + ip1 >= 4)
				return Formula.outcolour ? Formula.calc_outcolour(zre1, zim1, pre, pim, iter + 2) : iter + 2;
			if (rp + ip >= 4)
				return Formula.outcolour ? Formula.calc_outcolour(zre, zim, pre, pim, iter + 3) : iter + 3;

			return Formula.incolour ? Formula.calc_incolour(zre, zim, pre, pim) : 65535;

		case 1:
			return Formula.mand3_calc(x, y, x, y);
		case 2:
			return Formula.mand4_calc(x, y, x, y);
		case 3:
			return Formula.mand5_calc(x, y, x, y);
		case 4:
			return Formula.mand6_calc(x, y, x, y);
		case 5:
			return Formula.octo_calc(0, 0, x, y);
		case 6:
			return Formula.newton_calc(x, y, 1.0199502202048319698, 0);
		case 7:
			return Formula.barnsley1_calc(x, y, -0.6, 1.1);
		case 8:
			return Formula.barnsley2_calc(x, y, -0.6, 1.1);
		case 9:
			return Formula.phoenix_calc(x, y, 0.56666667, -0.5);
		case 10:
			return Formula.magnet1_calc(0, 0, x, y);
		case 11:
			return Formula.magnet2_calc(0, 0, x, y);

		}
	};

	/**
	 * z^3+p =
	 * zre = (rp-ip*3)*zre + pre
	 * zim = (rp*3-ip)*zim + pim
	 *
	 * @param {number} zre
	 * @param {number} zim
	 * @param {number} pre
	 * @param {number} pim
	 * @returns {number}
	 */
	Formula.mand3_calc = function (zre, zim, pre, pim) {
		var maxIter = Config.maxIter;
		var iter = 0;

		do {
			var rp3 = zre * zre;
			var ip3 = zim * zim;
			var zre3 = (rp3 - ip3 * 3) * zre + pre;
			var zim3 = (rp3 * 3 - ip3) * zim + pim;

			var rp2 = zre3 * zre3;
			var ip2 = zim3 * zim3;
			var zre2 = (rp2 - ip2 * 3) * zre3 + pre;
			var zim2 = (rp2 * 3 - ip2) * zim3 + pim;

			var rp1 = zre2 * zre2;
			var ip1 = zim2 * zim2;
			var zre1 = (rp1 - ip1 * 3) * zre2 + pre;
			var zim1 = (rp1 * 3 - ip1) * zim2 + pim;

			var rp = zre1 * zre1;
			var ip = zim1 * zim1;
			zre = (rp - ip * 3) * zre1 + pre;
			zim = (rp * 3 - ip) * zim1 + pim;

		} while (rp + ip < 4 && ++iter <= maxIter);

		iter *= 4;

		if (iter <= maxIter && Config.maxIter < iter + 100)
			Config.maxIter += Math.round((iter + 100 - Config.maxIter) * 0.01); // increase maxIter with low-pass filter

		if (rp3 + ip3 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre3, zim3, pre, pim, iter) : iter;
		if (rp2 + ip2 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre2, zim2, pre, pim, iter + 1) : iter + 1;
		if (rp1 + ip1 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre1, zim1, pre, pim, iter + 2) : iter + 2;
		if (rp + ip >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre, zim, pre, pim, iter + 3) : iter + 3;

		return Formula.incolour ? Formula.calc_incolour(zre, zim, pre, pim) : 65535;
	};

	/**
	 * z^4+p =
	 * zre = rp*rp -rp*ip*6 +ip*ip +pre
	 * zim = (rp-ip)*zre*zim*4 +pim
	 * =
	 * zre = (rp-ip)*(rp-ip)-rp*ip*4 +pre
	 * zim = (rp-ip)*zre*zim*4 +pim
	 *
	 * @param {number} zre
	 * @param {number} zim
	 * @param {number} pre
	 * @param {number} pim
	 * @returns {number}
	 */
	Formula.mand4_calc = function (zre, zim, pre, pim) {
		var maxIter = Config.maxIter;
		var iter = 0;
		var t;

		do {
			var rp3 = zre * zre;
			var ip3 = zim * zim;
			t = rp3 - ip3;
			var zre3 = t * t - rp3 * ip3 * 4 + pre;
			var zim3 = t * zre * zim * 4 + pim;

			var rp2 = zre3 * zre3;
			var ip2 = zim3 * zim3;
			t = rp2 - ip2;
			var zre2 = t * t - rp2 * ip2 * 4 + pre;
			var zim2 = t * zre3 * zim3 * 4 + pim;

			var rp1 = zre2 * zre2;
			var ip1 = zim2 * zim2;
			t = rp1 - ip1;
			var zre1 = t * t - rp1 * ip1 * 4 + pre;
			var zim1 = t * zre2 * zim2 * 4 + pim;

			var rp = zre1 * zre1;
			var ip = zim1 * zim1;
			t = rp - ip;
			zre = t * t - rp * ip * 4 + pre;
			zim = t * zre1 * zim1 * 4 + pim;
		} while (rp + ip < 4 && ++iter <= maxIter);

		iter *= 4;

		if (iter <= maxIter && Config.maxIter < iter + 100)
			Config.maxIter += Math.round((iter + 100 - Config.maxIter) * 0.01); // increase maxIter with low-pass filter

		if (rp3 + ip3 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre3, zim3, pre, pim, iter) : iter;
		if (rp2 + ip2 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre2, zim2, pre, pim, iter + 1) : iter + 1;
		if (rp1 + ip1 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre1, zim1, pre, pim, iter + 2) : iter + 2;
		if (rp + ip >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre, zim, pre, pim, iter + 3) : iter + 3;

		return Formula.incolour ? Formula.calc_incolour(zre, zim, pre, pim) : 65535;
	};

	/**
	 * z^5+p =
	 * zre = (rp*rp -rp*ip*10 +ip*ip*5)*zre + pre
	 * zim = (rp*rp*5 -rp*ip*10 +ip*ip)*zim + pim
	 * =
	 * zre = ((rp-ip)*(rp-ip)*5 -rp*rp*4)*zre + pre
	 * zim = ((rp-ip)*(rp-ip)*5 -ip*ip*4)*zim + pim
	 *
	 * @param {number} zre
	 * @param {number} zim
	 * @param {number} pre
	 * @param {number} pim
	 * @returns {number}
	 */
	Formula.mand5_calc = function (zre, zim, pre, pim) {
		var maxIter = Config.maxIter;
		var iter = 0;
		var t;

		do {
			var rp3 = zre * zre;
			var ip3 = zim * zim;
			t = rp3 - ip3;
			t = t * t * 5;
			var zre3 = (t - rp3 * rp3 * 4) * zre + pre;
			var zim3 = (t - ip3 * ip3 * 4) * zim + pim;

			var rp2 = zre3 * zre3;
			var ip2 = zim3 * zim3;
			t = rp2 - ip2;
			t = t * t * 5;
			var zre2 = (t - rp2 * rp2 * 4) * zre3 + pre;
			var zim2 = (t - ip2 * ip2 * 4) * zim3 + pim;

			var rp1 = zre2 * zre2;
			var ip1 = zim2 * zim2;
			t = rp1 - ip1;
			t = t * t * 5;
			var zre1 = (t - rp1 * rp1 * 4) * zre2 + pre;
			var zim1 = (t - ip1 * ip1 * 4) * zim2 + pim;

			var rp = zre1 * zre1;
			var ip = zim1 * zim1;
			t = rp - ip;
			t = t * t * 5;
			zre = (t - rp * rp * 4) * zre1 + pre;
			zim = (t - ip * ip * 4) * zim1 + pim;
		} while (rp + ip < 4 && ++iter <= maxIter);

		iter *= 4;

		if (iter <= maxIter && Config.maxIter < iter + 100)
			Config.maxIter += Math.round((iter + 100 - Config.maxIter) * 0.01); // increase maxIter with low-pass filter

		if (rp3 + ip3 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre3, zim3, pre, pim, iter) : iter;
		if (rp2 + ip2 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre2, zim2, pre, pim, iter + 1) : iter + 1;
		if (rp1 + ip1 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre1, zim1, pre, pim, iter + 2) : iter + 2;
		if (rp + ip >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre, zim, pre, pim, iter + 3) : iter + 3;

		return Formula.incolour ? Formula.calc_incolour(zre, zim, pre, pim) : 65535;
	};

	/**
	 * z^6+p =
	 * zre = rp*rp*rp -rp*rp*ip*15 +rp*ip*ip*15 -ip*ip*ip +pre
	 * zim = (rp*rp*6 -rp*ip*20 +ip*ip*6)*zre*zim  +pim
	 * =
	 * zre = (rp-ip)*(rp-ip)*(rp-ip) -(rp-ip)*rp*ip*12 +pre
	 * zim = ((rp-ip)*(rp-ip)*6-rp*ip*8)*zre*zim +pim
	 *
	 * @param {number} zre
	 * @param {number} zim
	 * @param {number} pre
	 * @param {number} pim
	 * @returns {number}
	 */
	Formula.mand6_calc = function (zre, zim, pre, pim) {
		var maxIter = Config.maxIter;
		var iter = 0;
		var t;

		do {
			var rp3 = zre * zre;
			var ip3 = zim * zim;
			t = rp3 - ip3;
			var zre3 = t * t * t - t * rp3 * ip3 * 12 + pre;
			var zim3 = (t * t * 6 - rp3 * ip3 * 8) * zre * zim + pim;

			var rp2 = zre3 * zre3;
			var ip2 = zim3 * zim3;
			t = rp2 - ip2;
			var zre2 = t * t * t - t * rp2 * ip2 * 12 + pre;
			var zim2 = (t * t * 6 - rp2 * ip2 * 8) * zre3 * zim3 + pim;

			var rp1 = zre2 * zre2;
			var ip1 = zim2 * zim2;
			t = rp1 - ip1;
			var zre1 = t * t * t - t * rp1 * ip1 * 12 + pre;
			var zim1 = (t * t * 6 - rp1 * ip1 * 8) * zre2 * zim2 + pim;

			var rp = zre1 * zre1;
			var ip = zim1 * zim1;
			t = rp - ip;
			zre = t * t * t - t * rp * ip * 12 + pre;
			zim = (t * t * 6 - rp * ip * 8) * zre1 * zim1 + pim;
		} while (rp + ip < 4 && ++iter <= maxIter);

		iter *= 4;

		if (iter <= maxIter && Config.maxIter < iter + 100)
			Config.maxIter += Math.round((iter + 100 - Config.maxIter) * 0.01); // increase maxIter with low-pass filter

		if (rp3 + ip3 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre3, zim3, pre, pim, iter) : iter;
		if (rp2 + ip2 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre2, zim2, pre, pim, iter + 1) : iter + 1;
		if (rp1 + ip1 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre1, zim1, pre, pim, iter + 2) : iter + 2;
		if (rp + ip >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre, zim, pre, pim, iter + 3) : iter + 3;

		return Formula.incolour ? Formula.calc_incolour(zre, zim, pre, pim) : 65535;
	};

	Formula.octo_calc = function (zre, zim, pre, pim) {
		var maxIter = Config.maxIter;
		var iter = 0;
		var zpr = 0;
		var zpi = 0;

		do {
			var zpr3 = pre + zre;
			var zpi3 = pim + zim;

			var rp = pre * pre;
			var ip = pim * pim;
			var pre3 = (rp - 3 * ip) * pre + zpr;
			var pim3 = (3 * rp - ip) * pim + zpi;
			var zpr2 = pre3 + zre;
			var zpi2 = pim3 + zim;

			var rp = pre3 * pre3;
			var ip = pim3 * pim3;
			var pre2 = (rp - 3 * ip) * pre3 + zpr3;
			var pim2 = (3 * rp - ip) * pim3 + zpi3;
			var zpr1 = pre2 + zre;
			var zpi1 = pim2 + zim;

			var rp = pre2 * pre2;
			var ip = pim2 * pim2;
			var pre1 = (rp - 3 * ip) * pre2 + zpr2;
			var pim1 = (3 * rp - ip) * pim2 + zpi2;
			var zpr = pre1 + zre;
			var zpi = pim1 + zim;

			var rp = pre1 * pre1;
			var ip = pim1 * pim1;
			var pre = (rp - 3 * ip) * pre1 + zpr1;
			var pim = (3 * rp - ip) * pim1 + zpi1;
		} while (rp + ip < 4 && ++iter <= maxIter);

		iter *= 4;

		if (iter <= maxIter && Config.maxIter < iter + 100)
			Config.maxIter += Math.round((iter + 100 - Config.maxIter) * 0.01); // increase maxIter with low-pass filter

		if (zpr3 * zpr3 + zpi3 * zpi3 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre3, zim3, pre, pim, iter) : iter;
		if (zpr2 * zpr2 + zpi2 * zpi2 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre2, zim2, pre, pim, iter + 1) : iter + 1;
		if (zpr1 * zpr1 + zpi1 * zpi1 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre1, zim1, pre, pim, iter + 2) : iter + 2;
		if (zpr * zpr + zpi * zpi < 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre, zim, pre, pim, iter + 3) : iter + 3;

		return Formula.incolour ? Formula.calc_incolour(zre, zim, pre, pim) : 65535;
	};

	Formula.newton_calc = function (zre, zim, pre, pim) {
		var maxIter = Config.maxIter;
		var iter = 0;
		var rp, ip;
		var n, sqrr, sqri, zre1, zim1;
		sqri = zim * zim, n = zre, zre = pre, pre = n, n = zim, zim = pim, pim = n, n = 1;

		rp = zre * zre;
		ip = zim * zim;
		while (++iter <= maxIter && (n > 1E-6)) {
			zre1 = zre;
			zim1 = zim;
			n = zim * zim;
			sqri = zre * zre;
			sqrr = sqri - n;
			sqri = n + sqri;
			n = 0.3333333333 / ((sqri * sqri));
			zim = 0.66666666 * zim - (zre + zre) * zim * n + pim;
			zre = 0.66666666 * zre + (sqrr) * n + pre;
			zre1 -= zre;
			zim1 -= zim;
			n = zre1 * zre1 + zim1 * zim1;
		}

		if (iter <= maxIter && Config.maxIter < iter + 100)
			Config.maxIter += Math.round((iter + 100 - Config.maxIter) * 0.01); // increase maxIter with low-pass filter

		if (iter <= maxIter)
			return Formula.outcolour ? Formula.calc_outcolour(zre, zim, pre, pim, iter) : iter;
		else
			return Formula.incolour ? Formula.calc_incolour(zre, zim, pre, pim) : 65535;
	};

	Formula.barnsley1_calc = function (zre, zim, pre, pim) {
		var maxIter = Config.maxIter;
		var iter = 0;
		var rp = zre * zre;
		var ip = zim * zim;
		while (rp + ip < 4 && ++iter <= maxIter) {
			var t = (zre >= 0) ? zre - 1 : zre + 1;
			zre = t * pre - zim * pim;
			zim = t * pim + zim * pre;
			rp = zre * zre;
			ip = zim * zim;
		}

		if (iter <= maxIter && Config.maxIter < iter + 100)
			Config.maxIter += Math.round((iter + 100 - Config.maxIter) * 0.01); // increase maxIter with low-pass filter

		if (iter <= maxIter)
			return Formula.outcolour ? Formula.calc_outcolour(zre, zim, pre, pim, iter) : iter;
		else
			return Formula.incolour ? Formula.calc_incolour(zre, zim, pre, pim) : 65535;
	};

	Formula.barnsley2_calc = function (zre, zim, pre, pim) {
		var maxIter = Config.maxIter;
		var iter = 0;
		var rp, ip;
		if (0)
			iter = 0;
		else {
			rp = zre * zre;
			ip = zim * zim;
			while (rp + ip < 4 && ++iter <= maxIter) {
				if (zre * pim + zim * pre >= 0) {
					rp = zre - 1;
				} else {
					rp = zre + 1;
				}
				((zre) = (rp) * (pre) - (zim) * (pim), (zim) = ((rp) * (pim)) + ((zim) * (pre)));
				rp = zre * zre;
				ip = zim * zim;
			}
		}

		if (iter <= maxIter && Config.maxIter < iter + 100)
			Config.maxIter += Math.round((iter + 100 - Config.maxIter) * 0.01); // increase maxIter with low-pass filter

		if (iter <= maxIter)
			return Formula.outcolour ? Formula.calc_outcolour(zre, zim, pre, pim, iter) : iter;
		else
			return Formula.incolour ? Formula.calc_incolour(zre, zim, pre, pim) : 65535;
	};

	Formula.phoenix_calc = function (zre, zim, pre, pim) {
		var maxIter = Config.maxIter;
		var iter = 0;
		var rp = zre * zre;
		var ip = zim * zim;
		var zpr = 0;
		var zpi = 0;
		do {
			// z[n+1] = z[n]*z[n]+pre+z[n-1]*pim
			var zre3 = rp -ip +pre+zpr; var zim3 = zre *zim *2+zpi; zpr = zre *pim; zpi = zim *pim; rp3 = zre3*zre3; ip3 = zim3*zim3;
			var zre2 = rp3-ip3+pre+zpr; var zim2 = zre3*zim3*2+zpi; zpr = zre3*pim; zpi = zim3*pim; rp2 = zre2*zre2; ip2 = zim2*zim2;
			var zre1 = rp2-ip2+pre+zpr; var zim1 = zre2*zim2*2+zpi; zpr = zre2*pim; zpi = zim2*pim; rp1 = zre1*zre1; ip1 = zim1*zim1;
			var zre  = rp1-ip1+pre+zpr; var zim  = zre1*zim1*2+zpi; zpr = zre1*pim; zpi = zim1*pim; rp  = zre *zre ; ip  = zim *zim ;
		} while (rp + ip < 4 && ++iter <= maxIter);

		iter *= 4;

		if (iter <= maxIter && Config.maxIter < iter + 100)
			Config.maxIter += Math.round((iter + 100 - Config.maxIter) * 0.01); // increase maxIter with low-pass filter

		if (rp3 + ip3 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre3, zim3, pre, pim, iter) : iter;
		if (rp2 + ip2 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre2, zim2, pre, pim, iter + 1) : iter + 1;
		if (rp1 + ip1 >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre1, zim1, pre, pim, iter + 2) : iter + 2;
		if (rp + ip >= 4)
			return Formula.outcolour ? Formula.calc_outcolour(zre, zim, pre, pim, iter + 3) : iter + 3;

		return Formula.incolour ? Formula.calc_incolour(zre, zim, pre, pim) : 65535;
	};

	Formula.magnet1_calc = function (zre, zim, pre, pim) {
		var maxIter = Config.maxIter;
		var iter = 0;
		var rp = zre * zre;
		var ip = zim * zim;
		do {
			// ( (z*z+(p-1)) / (z*2+(p-2)) ) ^2
			var t1re = rp - ip + pre - 1;
			var t1im = zre * zim * 2 + pim;

			var t2re = zre * 2 + pre - 2;
			var t2im = zim * 2 + pim;

			var t = t2re * t2re + t2im * t2im;
			var t3re = (t1re * t2re + t1im * t2im) / t;
			var t3im = (t1im * t2re - t1re * t2im) / t;

			var zre = t3re * t3re - t3im * t3im;
			var zim = t3re * t3im * 2;

			var rp = zre * zre;
			var ip = zim * zim;
			var t = rp + ip;
		} while (t < 100 * 100 && t > zre * 2 - 0.99 && ++iter <= maxIter);

		if (iter <= maxIter && Config.maxIter < iter + 100)
			Config.maxIter += Math.round((iter + 100 - Config.maxIter) * 0.01); // increase maxIter with low-pass filter

		if (iter <= maxIter)
			return Formula.outcolour ? Formula.calc_outcolour(zre, zim, pre, pim, iter) : iter;
		else
			return Formula.incolour ? Formula.calc_incolour(zre, zim, pre, pim) : 65535;
	};

	Formula.magnet2_calc = function (zre, zim, pre, pim) {
		var maxIter = Config.maxIter;
		var iter = 0;
		var rp = zre * zre;
		var ip = zim * zim;
		var c1re = (pre - 1) * 3;
		var c1im = (pim - 0) * 3;
		var c2re = (pre - 1) * (pre - 2) - pim * pim;
		var c2im = (pre - 1) * pim + (pre - 2) * pim;
		var c3re = (pre - 2) * 3;
		var c3im = (pim - 0) * 3;
		var c4re = (pre - 1) * (pre - 2) - pim * pim + 1;
		var c4im = (pre - 1) * pim + (pre - 2) * pim + 0;
		do {
			// ( (z*z*z +z*(p-1)*3 +(p-1)*(p-2) ) / (z*z*3 +z*(p-2)*3 +(p-1)*(p-2)+1) ) ^2
			// ( (z*z*z +z*c1 +c2 ) / (z*z*3 +z*c3 +c4) ) ^2

			var t1re = (ip * -3 + rp) * zre + (zre * c1re - zim * c1im) + c2re;
			var t1im = (rp * 3 - ip) * zim + (zre * c1im + zim * c1re) + c2im;

			var t2re = (rp - ip) * 3 + (zre * c3re - zim * c3im) + c4re;
			var t2im = (zre * zim * 2) * 3 + (zre * c3im + zim * c3re) + c4im;

			var t = t2re * t2re + t2im * t2im;
			var t3re = (t1re * t2re + t1im * t2im) / t;
			var t3im = (t1im * t2re - t1re * t2im) / t;

			zre = t3re * t3re - t3im * t3im;
			zim = t3re * t3im * 2;

			var rp = zre * zre;
			var ip = zim * zim;

		} while (rp + ip < 100 * 100 && rp + ip > zre * 2 - 0.99 && ++iter <= maxIter);

		if (iter <= maxIter && Config.maxIter < iter + 100)
			Config.maxIter += Math.round((iter + 100 - Config.maxIter) * 0.01); // increase maxIter with low-pass filter

		if (iter <= maxIter)
			return Formula.outcolour ? Formula.calc_outcolour(zre, zim, pre, pim, iter) : iter;
		else
			return Formula.incolour ? Formula.calc_incolour(zre, zim, pre, pim) : 65535;
	};

	Formula.calc_incolour = function (zre, zim, pre, pim) {
		var paletteSize = Config.paletteSize;

		switch (Formula.incolour) {
		case 0: // maxiter
			return 65535;
		case 1: // zmag
			iter = (zre * zre + zim * zim);
			// range 0..4
			return (iter * (paletteSize >> 2)) | 0;
		case 2: // real
			iter = Math.atan2(zre, zim);
			// range -PI..+PI
			return ((iter + Math.PI) * paletteSize / Math.PI) >> 1;
		case 3: // real/imag
			iter = zre / zim;
			// range anything
			iter = Math.floor(iter * 10);
			return (iter >= 0) ? iter % paletteSize : ((paletteSize - 1) - (-iter - 1) % paletteSize);
		case 4: // mag*cos(real^2)
			iter = (zre * zre + zim * zim) * Math.cos(zre * zre);
			// range -1..+1 (as implied by original code)
			return ((iter + 1) * paletteSize) >> 1;
		case 5: // sin(real^2-imag^2)
			iter = Math.sin(zre * zre - zim * zim);
			// range -1..+1
			return ((iter + 1) * paletteSize) >> 1;
		case 6: // atan(real*imag*creal*cimag)
			iter = Math.atan(zre * zim * pre * pim);
			// range -PI/2..+PI/2
			return ((iter + Math.PI / 2) * paletteSize / Math.PI) | 0;
		case 7: // squares. larger number = smaller squares
			if ((Math.abs(zre * 80) & 1) ^ (Math.abs((zim * 80) & 1))) {
				iter = Math.atan2(zre, zim);
			} else {
				iter = Math.atan2(zim, zre);
			}
			// range -PI..+PI
			return ((iter + Math.PI) * paletteSize / Math.PI) >> 1;
		}
	};

	Formula.calc_outcolour = function (zre, zim, pre, pim, iter) {
		var paletteSize = Config.paletteSize;

		switch (Formula.outcolour) {
		case 0: // iter
			return iter;
		case 1: // iter+real
			iter += zre | 0;
			break;
		case 2: // iter+imag
			iter += zim | 0;
			break;
		case 3: // iter+real/imag
			iter += (zre / zim) | 0;
			break;
		case 4: // iter+real+imag+real/imag
			iter += (zre + zim + zre / zim) | 0;
			break;
		case 5: // binary decomposition
			if (zim >= 0)
				iter = paletteSize - iter;
			break;
		case 6: // biomorphs
			if (Math.abs(zim) < 2.0 || Math.abs(zre) < 2.0)
				iter = paletteSize - iter;
			break;
		case 7: // potential
			iter = (Math.sqrt(Math.log(zre * zre + zim * zim) / iter) * paletteSize) | 0;
			break;
		case 8: // color decomposition
			iter = Math.atan2(zre, zim) * 4;
			// range -4PI..+4PI
			iter = ((iter + Math.PI * 4) * paletteSize / Math.PI) >> 1;
			// the above has >>1 instead of >>3, so the result range is 0..4*paletteSize
			return iter % paletteSize;
		}

		return (iter >= 0) ? iter % paletteSize : ((paletteSize - 1) - (-iter - 1) % paletteSize);
	};
}
