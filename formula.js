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

function Formula () {

	Formula.initial = [
		{x: -0.75, y: 0.0, r: 2.5, a:0},
		{x: 0.0, y: 0.0, r: 2.5, a:0},
		{x: 0.0, y: 0.0, r: 2.5, a:0},
		{x: 0.0, y: 0.0, r: 2.5, a:0},
		{x: 0.0, y: 0.0, r: 2.5, a:0},
		{x: 0.0, y: 0.0, r: 2.5, a:0},
		{x: 0.0, y: 0.0, r: 2.5, a:0},
		{x: 0.0, y: 0.0, r: 3.5, a:0},
		{x: 0.0, y: 0.0, r: 3.5, a:0},
		{x: 0.0, y: 0.0, r: 3.0, a:0},
		{x: 1.5, y: 0.0, r: 6.0, a:0},
		{x: 1.5, y: 0.0, r: 4.0, a:0}
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

		var maxiter = Config.depthNow;
		var iter = maxiter >> 2;

		switch (Formula.formula) {
			case 0: // mandelbrot
				var zre = x, zim = y, pre = x, pim = y;
				var rp = zre * zre, ip = zim * zim;
				while (rp + ip < 4 && --iter > 0) {
					var zre3 = rp - ip + pre;
					var rp3 = zre3 * zre3;
					var zim3 = zim * zre * 2 + pim;
					var ip3 = zim3 * zim3;

					var zre2 = rp3 - ip3 + pre;
					var rp2 = zre2 * zre2;
					var zim2 = zim3 * zre3 * 2 + pim;
					var ip2 = zim2 * zim2;

					var zre1 = rp2 - ip2 + pre;
					var rp1 = zre1 * zre1;
					var zim1 = zim2 * zre2 * 2 + pim;
					var ip1 = zim1 * zim1;

					zre = rp1 - ip1 + pre;
					rp = zre * zre;
					zim = zim1 * zre1 * 2 + pim;
					ip = zim * zim;
				}

//		if (iter < 0) return incolor ? incolor_output(zre, zim, pre, pim, maxiter) : 0;

				if (rp3 + ip3 >= 4) {
					iter = maxiter - iter * 4 + 1;
					return Formula.outcolour ? Formula.calc_outcolour(zre3, zim3, pre, pim, iter) : iter;
				}
				if (rp2 + ip2 >= 4) {
					iter = maxiter - iter * 4 + 2;
					return Formula.outcolour ? Formula.calc_outcolour(zre2, zim2, pre, pim, iter) : iter;
				}
				if (rp1 + ip1 >= 4) {
					iter = maxiter - iter * 4 + 3;
					return Formula.outcolour ? Formula.calc_outcolour(zre1, zim1, pre, pim, iter) : iter;
				}
				if (rp + ip >= 4) {
					iter = maxiter - iter * 4 + 0;
					return Formula.outcolour ? Formula.calc_outcolour(zre, zim, pre, pim, iter) : iter;
				}
				return Formula.incolour ? Formula.calc_incolour(zre, zim, pre, pim, maxiter - iter * 4) : 65535;

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
			case 7: // barnsley1
				if (0) {
					var zre = x, zim = y, pre = -0.6, pim = 1.1;
					var iter = maxiter >> 0;
					do {
						var rp = zre * zre, ip = zim * zim;
						var t = (zre >= 0) ? zre - 1 : zre + 1;
						var zre = t * pre - zim * pim;
						var zim = t * pim + zim * pre;
					} while (--iter > 0 && rp + ip < 4);
					break;
				}

				return Formula.barnsley1_calc(x, y, -0.6, 1.1);

				var t = (zre >= 0) ? zre - 1 : zre + 1;
				zre = t * pre - zim * pim;
				zim = t * pim + zim * pre;

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

	Formula.mand3_calc = function (zre, zim, pre, pim) {
		var maxiter = Config.depthNow;
		var iter = maxiter>>2;
		var rp = zre*zre;
		var ip = zim*zim;
		do {
			// z^3+p =
			// zre = (rp-ip*3)*zre + pre
			// zim = (rp*3-ip)*zim + pim
			zre = (rp -ip *3)*zre+pre; var rp3 = zre*zre; zim = (rp *3-ip )*zim+pim; var ip3 = zim*zim;
			zre = (rp3-ip3*3)*zre+pre; var rp2 = zre*zre; zim = (rp3*3-ip3)*zim+pim; var ip2 = zim*zim;
			zre = (rp2-ip2*3)*zre+pre; var rp1 = zre*zre; zim = (rp2*3-ip2)*zim+pim; var ip1 = zim*zim;
			zre = (rp1-ip1*3)*zre+pre; var rp  = zre*zre; zim = (rp1*3-ip1)*zim+pim; var ip  = zim*zim;
		} while (--iter && rp+ip < 4);

		iter = maxiter - (iter<<2);
		if (rp3+ip3 >= 4) return iter-3;
		if (rp2+ip2 >= 4) return iter-2;
		if (rp1+ip1 >= 4) return iter-1;
		return iter;
	};

	Formula.mand4_calc = function (zre, zim, pre, pim) {
		var maxiter = Config.depthNow;
		var iter = maxiter>>2;
		var rp = zre*zre;
		var ip = zim*zim;
		do {
			// z^4+p =
			// zre = rp*rp -rp*ip*6 +ip*ip +pre
			// zim = (rp-ip)*zre*zim*4 +pim
			// =
			// zre = (rp-ip)*(rp-ip)-rp*ip*4 +pre
			// zim = (rp-ip)*zre*zim*4 +pim
			var t = rp -ip ; zim = t*zre*zim*4+pim; var ip3 = zim*zim; zre = t*t-rp *ip *4+pre; var rp3 = zre*zre;
			var t = rp3-ip3; zim = t*zre*zim*4+pim; var ip2 = zim*zim; zre = t*t-rp3*ip3*4+pre; var rp2 = zre*zre;
			var t = rp2-ip2; zim = t*zre*zim*4+pim; var ip1 = zim*zim; zre = t*t-rp2*ip2*4+pre; var rp1 = zre*zre;
			var t = rp1-ip1; zim = t*zre*zim*4+pim; var ip  = zim*zim; zre = t*t-rp1*ip1*4+pre; var rp  = zre*zre;
		} while (--iter && rp+ip < 4);

		iter = maxiter - (iter<<2);
		if (rp3+ip3 >= 4) return iter-3;
		if (rp2+ip2 >= 4) return iter-2;
		if (rp1+ip1 >= 4) return iter-1;
		return iter;
	};

	Formula.mand5_calc = function (zre, zim, pre, pim) {
		var maxiter = Config.depthNow;
		var iter = maxiter>>2;
		var rp = zre*zre;
		var ip = zim*zim;
		do {
			// z^5+p =
			// zre = (rp*rp -rp*ip*10 +ip*ip*5)*zre + pre
			// zim = (rp*rp*5 -rp*ip*10 +ip*ip)*zim + pim
			// =
			// zre = ((rp-ip)*(rp-ip)*5 -rp*rp*4)*zre + pre
			// zim = ((rp-ip)*(rp-ip)*5 -ip*ip*4)*zim + pim
			var t1=rp -ip ,t2=t1*t1*5; zre = (t2-rp *rp *4)*zre+pre; var rp3 = zre*zre; zim = (t2-ip *ip *4)*zim+pim; var ip3 = zim*zim;
			var t1=rp3-ip3,t2=t1*t1*5; zre = (t2-rp3*rp3*4)*zre+pre; var rp2 = zre*zre; zim = (t2-ip3*ip3*4)*zim+pim; var ip2 = zim*zim;
			var t1=rp2-ip2,t2=t1*t1*5; zre = (t2-rp2*rp2*4)*zre+pre; var rp1 = zre*zre; zim = (t2-ip2*ip2*4)*zim+pim; var ip1 = zim*zim;
			var t1=rp1-ip1,t2=t1*t1*5; zre = (t2-rp1*rp1*4)*zre+pre; var rp  = zre*zre; zim = (t2-ip1*ip1*4)*zim+pim; var ip  = zim*zim;
		} while (--iter && rp+ip < 4);

		iter = maxiter - (iter<<2);
		if (rp3+ip3 >= 4) return iter-3;
		if (rp2+ip2 >= 4) return iter-2;
		if (rp1+ip1 >= 4) return iter-1;
		return iter;
	};

	Formula.mand6_calc = function (zre, zim, pre, pim) {
		var maxiter = Config.depthNow;
		var iter = maxiter>>2;
		var rp = zre*zre;
		var ip = zim*zim;
		do {
			// z^6+p =
			// zre = rp*rp*rp -rp*rp*ip*15 +rp*ip*ip*15 -ip*ip*ip +pre
			// zim = (rp*rp*6 -rp*ip*20 +ip*ip*6)*zre*zim  +pim
			// =
			// zre = (rp-ip)*(rp-ip)*(rp-ip) -(rp-ip)*rp*ip*12 +pre
			// zim = ((rp-ip)*(rp-ip)*6-rp*ip*8)*zre*zim +pim
			var t1=rp -ip ,t2=t1*t1,t3=rp *ip ; zim = (t2*6-t3*8)*zre*zim+pim; var ip3 = zim*zim; zre = (t3*-12+t2)*t1 +pre; var rp3 = zre*zre;
			var t1=rp3-ip3,t2=t1*t1,t3=rp3*ip3; zim = (t2*6-t3*8)*zre*zim+pim; var ip2 = zim*zim; zre = (t3*-12+t2)*t1 +pre; var rp2 = zre*zre;
			var t1=rp2-ip2,t2=t1*t1,t3=rp2*ip2; zim = (t2*6-t3*8)*zre*zim+pim; var ip1 = zim*zim; zre = (t3*-12+t2)*t1 +pre; var rp1 = zre*zre;
			var t1=rp1-ip1,t2=t1*t1,t3=rp1*ip1; zim = (t2*6-t3*8)*zre*zim+pim; var ip  = zim*zim; zre = (t3*-12+t2)*t1 +pre; var rp  = zre*zre;
		} while (--iter && rp+ip < 4);

		iter = maxiter - (iter<<2);
		if (rp3+ip3 >= 4) return iter-3;
		if (rp2+ip2 >= 4) return iter-2;
		if (rp1+ip1 >= 4) return iter-1;
		return iter;
	};

	Formula.octo_calc = function (zre, zim, pre, pim) {
		var maxiter = Config.depthNow;
		var iter = maxiter>>2;
		var zpr = 0;
		var zpi = 0;

		do {
			var zpr3 = pre+zre;
			var zpi3 = pim+zim;

			var rp = pre*pre;
			var ip = pim*pim;
			var pre3 = (rp-3*ip)*pre+zpr;
			var pim3 = (3*rp-ip)*pim+zpi;
			var zpr2 = pre3+zre;
			var zpi2 = pim3+zim;

			var rp = pre3*pre3;
			var ip = pim3*pim3;
			var pre2 = (rp-3*ip)*pre3+zpr3;
			var pim2 = (3*rp-ip)*pim3+zpi3;
			var zpr1 = pre2+zre;
			var zpi1 = pim2+zim;

			var rp = pre2*pre2;
			var ip = pim2*pim2;
			var pre1 = (rp-3*ip)*pre2+zpr2;
			var pim1 = (3*rp-ip)*pim2+zpi2;
			var zpr = pre1+zre;
			var zpi = pim1+zim;

			var rp = pre1*pre1;
			var ip = pim1*pim1;
			var pre = (rp-3*ip)*pre1+zpr1;
			var pim = (3*rp-ip)*pim1+zpi1;

		} while (--iter && zpr*zpr + zpi*zpi < 4);

		iter = maxiter - (iter<<2);
		if (zpr3*zpr3 + zpi3*zpi3 >= 4) return iter-3;
		if (zpr2*zpr2 + zpi2*zpi2 >= 4) return iter-2;
		if (zpr1*zpr1 + zpi1*zpi1 >= 4) return iter-1;
		return iter;
	};

	Formula.newton_calc = function (zre, zim, pre, pim) {
		var maxiter = Config.depthNow;
		var iter = maxiter;
		var rp, ip;
		var n, sqrr, sqri, zre1, zim1;
		sqri = zim * zim, n = zre, zre = pre, pre = n, n = zim, zim = pim, pim = n, n = 1;

		rp = zre * zre;
		ip = zim * zim;
		while (iter && (n > 1E-6)) {
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
			iter--;
		}

		iter = maxiter - iter;
		return iter;
	};

	Formula.barnsley1_calc = function (zre, zim, pre, pim) {
		var maxiter = Config.depthNow;
		var iter = maxiter;
		var rp = zre * zre;
		var ip = zim * zim;
		while (iter && rp + ip < 4) {
			var t = (zre >= 0) ? zre - 1 : zre + 1;
			zre = t * pre - zim * pim;
			zim = t * pim + zim * pre;
			rp = zre * zre;
			ip = zim * zim;
			iter--;
		}

		iter = maxiter - iter;
		if (iter >= maxiter) {
			return Formula.incolour ? Formula.calc_incolour(zre, zim, pre, pim, maxiter - iter * 4) : 65535;
		} else {
			return Formula.outcolour ? Formula.calc_outcolour(zre, zim, pre, pim, iter) : iter;
		}
	};

	Formula.barnsley2_calc = function (zre, zim, pre, pim) {
		var maxiter = Config.depthNow;
		var iter = maxiter;
		var rp, ip;
		if (0)
			iter = 0;
		else {
			rp = zre * zre;
			ip = zim * zim;
			while ((iter) && (rp + ip < 4)) {
				if (zre * pim + zim * pre >= 0) {
					rp = zre - 1;
				} else {
					rp = zre + 1;
				}
				((zre) = (rp) * (pre) - (zim) * (pim), (zim) = ((rp) * (pim)) + ((zim) * (pre)));
				rp = zre * zre;
				ip = zim * zim;
				iter--;
			}
		}

		iter = maxiter - iter;
		if (iter >= maxiter) {
			return Formula.incolour ? Formula.calc_incolour(zre, zim, pre, pim, maxiter - iter * 4) : 65535;
		} else {
			return Formula.outcolour ? Formula.calc_outcolour(zre, zim, pre, pim, iter) : iter;
		}
	};

	Formula.phoenix_calc = function (zre, zim, pre, pim) {
		var maxiter = Config.depthNow;
		var iter = maxiter>>2;
		var rp = zre*zre;
		var ip = zim*zim;
		var zpr = 0;
		var zpi = 0;
		do {
			// z[n+1] = z[n]*z[n]+pre+z[n-1]*pim
			var zre3 = rp -ip +pre+zpr; var zim3 = zre *zim *2+zpi; zpr = zre *pim; zpi = zim *pim; rp3 = zre3*zre3; ip3 = zim3*zim3;
			var zre2 = rp3-ip3+pre+zpr; var zim2 = zre3*zim3*2+zpi; zpr = zre3*pim; zpi = zim3*pim; rp2 = zre2*zre2; ip2 = zim2*zim2;
			var zre1 = rp2-ip2+pre+zpr; var zim1 = zre2*zim2*2+zpi; zpr = zre2*pim; zpi = zim2*pim; rp1 = zre1*zre1; ip1 = zim1*zim1;
			var zre  = rp1-ip1+pre+zpr; var zim  = zre1*zim1*2+zpi; zpr = zre1*pim; zpi = zim1*pim; rp  = zre *zre ; ip  = zim *zim ;
		} while (--iter && rp+ip < 4);

		iter = maxiter - (iter<<2);
		if (rp3+ip3 >= 4) return iter-3;
		if (rp2+ip2 >= 4) return iter-2;
		if (rp1+ip1 >= 4) return iter-1;
		return iter;
	};

	Formula.magnet1_calc = function (zre, zim, pre, pim) {
		var maxiter = Config.depthNow;
		var iter = maxiter;
		var rp = zre*zre;
		var ip = zim*zim;
		do {
			// ( (z*z+(p-1)) / (z*2+(p-2)) ) ^2
			var t1re = rp-ip+pre-1;
			var t1im = zre*zim*2+pim;

			var t2re = zre*2+pre-2;
			var t2im = zim*2+pim;

			var t = t2re*t2re+t2im*t2im;
			var t3re = (t1re*t2re+t1im*t2im)/t;
			var t3im = (t1im*t2re-t1re*t2im)/t;

			var zre = t3re*t3re-t3im*t3im;
			var zim = t3re*t3im*2;

			var rp = zre*zre;
			var ip = zim*zim;
			var t = rp+ip;
		} while (--iter && t < 100*100 && t > zre*2-0.99);

		iter = maxiter - iter;
		return iter;
	};

	Formula.magnet2_calc = function (zre, zim, pre, pim) {
		var maxiter = Config.depthNow;
		var iter = maxiter;
		var rp = zre*zre;
		var ip = zim*zim;
		var c1re = (pre-1)*3;
		var c1im = (pim-0)*3;
		var c2re = (pre-1)*(pre-2)-pim*pim;
		var c2im = (pre-1)*pim+(pre-2)*pim;
		var c3re = (pre-2)*3;
		var c3im = (pim-0)*3;
		var c4re = (pre-1)*(pre-2)-pim*pim+1;
		var c4im = (pre-1)*pim+(pre-2)*pim+0;
		do {
			// ( (z*z*z +z*(p-1)*3 +(p-1)*(p-2) ) / (z*z*3 +z*(p-2)*3 +(p-1)*(p-2)+1) ) ^2
			// ( (z*z*z +z*c1 +c2 ) / (z*z*3 +z*c3 +c4) ) ^2

			var t1re = (ip*-3+rp)*zre + (zre*c1re-zim*c1im) + c2re;
			var t1im = (rp* 3-ip)*zim + (zre*c1im+zim*c1re) + c2im;

			var t2re = (rp-ip    )*3  + (zre*c3re-zim*c3im) + c4re;
			var t2im = (zre*zim*2)*3  + (zre*c3im+zim*c3re) + c4im;

			var t = t2re*t2re+t2im*t2im;
			var t3re = (t1re*t2re+t1im*t2im)/t;
			var t3im = (t1im*t2re-t1re*t2im)/t;

			zre = t3re*t3re-t3im*t3im;
			zim = t3re*t3im*2;

			var rp = zre*zre;
			var ip = zim*zim;

		} while (--iter && rp+ip < 100*100 && rp+ip > zre*2-0.99);

		iter = maxiter - iter;
		return iter;
	};

	Formula.calc_incolour = function (zre, zim, pre, pim, iter) {
		var paletteSize = Config.paletteSize;

		switch (Formula.incolour) {
			case 0: // iter
				// range 1..maxiter
				return iter;
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
				iter = Math.floor(iter*10);
				return (iter >= 0) ? iter : ((paletteSize - 1) - (-iter - 1) % paletteSize);
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
				return ((iter + Math.PI/2) * paletteSize / Math.PI) | 0;
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

		iter <<= 8;

		switch (Formula.outcolour) {
			case 1:                /* real */
				iter = (iter + zre * 256);
				break;
			case 2:                /* imag */
				iter = (iter + zim * 256);
				break;
			case 3:                /* real / imag */
				iter = (iter + (zre / zim) * 256);
				break;
			case 4:                /* all of the above */
				iter = (iter + (zre + zim + zre / zim) * 256);
				break;
			case 5:
				if (zim > 0)
					iter = ((maxiter << 8) - iter);
				break;
			case 6:
				if (Math.abs(zim) < 2.0 || Math.abs(zre) < 2.0)
					iter = ((maxiter << 8) - iter);
				break;
			case 7:
				zre = zre * zre + zim * zim;
				iter = (Math.sqrt(Math.log(zre) / iter) * 256 * 256);
				break;
			case 8:
				iter = ((Math.atan2(zre, zim) / (Math.PI + Math.PI) + 0.75) * 20000);
				break;
		}

		if (iter < 0) {
			iter = ((paletteSize - 1) << 8) - ((-iter) % ((paletteSize - 1) << 8)) - 1;
			if (iter < 0)
				iter = 0;
		}
		iter %= (paletteSize - 1) << 8;
		return 1 + (iter >> 8);
	}

}
