/** The notation registry is shared by parsing, completion, preview, and LaTeX export.
 * These are syntax constructors, not declarations of mathematical truth or types. */
export const mathIdentifiers = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta',
  'iota', 'kappa', 'varkappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'varpi', 'rho', 'varrho',
  'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
  'infty', 'ell', 'dagger', 'ddagger', 'prime', 'top', 'bot', 'emptyset', 'varnothing',
  'cdots', 'ldots', 'vdots', 'ddots', 'partial', 'nabla', 'hbar', 'imath', 'jmath',
]);

export const mathFunctions = new Set([
  'sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'exp', 'log', 'ln', 'min', 'max', 'inf', 'sup', 'lim', 'limsup', 'liminf',
  'Pr', 'Tr', 'dim', 'det', 'gcd', 'ker', 'arg', 'Re', 'Im',
]);

export const mathBinaryCommands: Record<string, string> = {
  otimes: 'tensor', oplus: 'direct-sum', odot: 'hadamard-product', circ: 'compose',
  cdot: 'multiply', times: 'multiply', ast: 'convolution', bmod: 'modulo',
  mapsto: 'maps-to', to: 'arrow', rightarrow: 'arrow', longrightarrow: 'arrow',
  leftarrow: 'left-arrow', leftrightarrow: 'iff', Leftrightarrow: 'iff', iff: 'iff',
  le: '<=', leq: '<=', ge: '>=', geq: '>=', ne: '!=', neq: '!=',
  approx: 'approximately', simeq: 'asymptotic-equivalent', sim: 'similar',
  equiv: 'equivalent', cong: 'congruent', propto: 'proportional',
  in: 'in', notin: 'not-in', ni: 'contains', subset: 'proper-subset', subseteq: 'subset',
  supset: 'proper-superset', supseteq: 'superset', cup: 'union', cap: 'intersection',
  setminus: 'difference', land: 'and', wedge: 'and', lor: 'or', vee: 'or',
  implies: 'implies', Rightarrow: 'implies', mid: 'such-that', parallel: 'parallel',
  perp: 'perpendicular', ll: 'much-less', gg: 'much-greater', prec: 'precedes',
  preceq: 'precedes-or-equal', succ: 'succeeds', succeq: 'succeeds-or-equal',
};

export const mathStyles = new Set(['mathbb', 'mathcal', 'mathrm', 'mathbf', 'mathsf', 'mathit', 'mathfrak', 'boldsymbol']);
export const mathAccents = new Set(['hat', 'widehat', 'tilde', 'widetilde', 'bar', 'overline', 'vec', 'dot', 'ddot']);
export const mathAggregates = new Set(['sum', 'prod', 'bigotimes', 'bigoplus', 'bigcup', 'bigcap', 'int', 'iint', 'oint']);
export const mathEnvironments = new Set(['matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'cases', 'aligned']);
export const mathDelimiters: Record<string, string> = {
  lbrace: 'set-open', rbrace: 'set-close', langle: 'angle-open', rangle: 'angle-close',
  lvert: 'abs-open', rvert: 'abs-close', lVert: 'norm-open', rVert: 'norm-close',
  lfloor: 'floor-open', rfloor: 'floor-close', lceil: 'ceil-open', rceil: 'ceil-close',
  lparen: '(', rparen: ')', lbrack: '[', rbrack: ']',
  vert: 'bar', Vert: 'norm-bar',
};
export const mathSpecialCommands = new Set([
  'frac', 'dfrac', 'tfrac', 'sqrt', 'ket', 'bra', 'braket', 'ketbra', 'norm', 'abs', 'ip', 'set',
  'forall', 'exists', 'neg', 'lnot', 'operatorname', 'text', 'pmod', 'binom',
  ...mathStyles, ...mathAccents, ...mathAggregates,
]);

/** Fixed, reviewed macros only. User-supplied macro definitions are not evaluated. */
const macroDefinitions = [
  { name: 'ket', arguments: 1, body: '\\left|#1\\right\\rangle' },
  { name: 'bra', arguments: 1, body: '\\left\\langle#1\\right|' },
  { name: 'braket', arguments: 2, body: '\\left\\langle#1\\middle|#2\\right\\rangle' },
  { name: 'ketbra', arguments: 2, body: '\\left|#1\\right\\rangle\\!\\left\\langle#2\\right|' },
  { name: 'norm', arguments: 1, body: '\\left\\lVert#1\\right\\rVert' },
  { name: 'abs', arguments: 1, body: '\\left|#1\\right|' },
  { name: 'ip', arguments: 2, body: '\\left\\langle#1,#2\\right\\rangle' },
  { name: 'set', arguments: 2, body: '\\left\\{#1\\,\\middle|\\,#2\\right\\}' },
  { name: 'Tr', arguments: 0, body: '\\operatorname{Tr}' },
] as const;

export const mathMacros: Record<string, string> = Object.fromEntries(macroDefinitions.map(macro => [`\\${macro.name}`, macro.body]));
export const latexMathPreamble: string[] = macroDefinitions.map(macro => `\\newcommand{\\${macro.name}}${macro.arguments ? `[${macro.arguments}]` : ''}{${macro.body}}`);
export const mathCommands = [...new Set([
  ...mathIdentifiers, ...mathFunctions, ...Object.keys(mathBinaryCommands), ...mathSpecialCommands,
  ...Object.keys(mathDelimiters), 'left', 'right', 'begin', 'end', 'quad', 'qquad',
])].sort();
