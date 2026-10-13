// A small arithmetic language for pricing-table columns: numbers, lowercase
// column ids, + - * / and parentheses. It never calls eval or Function.

export type FormulaAst =
  | { kind: "num"; value: number }
  | { kind: "ref"; name: string }
  | { kind: "neg"; arg: FormulaAst }
  | { kind: "bin"; op: "+" | "-" | "*" | "/"; left: FormulaAst; right: FormulaAst };

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormulaError";
  }
}

const MAX_LENGTH = 200;
const MAX_DEPTH = 32;

type Token = { type: "num"; value: number } | { type: "ident"; value: string } | { type: "op"; value: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    const rest = source.slice(i);
    const num = /^\d+(?:\.\d+)?/.exec(rest);
    if (num) {
      tokens.push({ type: "num", value: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const ident = /^[a-z_][a-z0-9_]*/.exec(rest);
    if (ident) {
      tokens.push({ type: "ident", value: ident[0] });
      i += ident[0].length;
      continue;
    }
    throw new FormulaError(`Unexpected character "${ch}" in formula.`);
  }
  return tokens;
}

export function parseFormula(source: string): FormulaAst {
  if (source.trim() === "") throw new FormulaError("Formula is empty.");
  if (source.length > MAX_LENGTH) throw new FormulaError(`Formula is longer than ${MAX_LENGTH} characters.`);
  const tokens = tokenize(source);
  let pos = 0;

  const isOp = (value: string) => {
    const token = tokens[pos];
    return token?.type === "op" && token.value === value;
  };

  function expression(depth: number): FormulaAst {
    let left = term(depth);
    while (isOp("+") || isOp("-")) {
      const op = tokens[pos++].value as "+" | "-";
      left = { kind: "bin", op, left, right: term(depth) };
    }
    return left;
  }

  function term(depth: number): FormulaAst {
    let left = unary(depth);
    while (isOp("*") || isOp("/")) {
      const op = tokens[pos++].value as "*" | "/";
      left = { kind: "bin", op, left, right: unary(depth) };
    }
    return left;
  }

  function unary(depth: number): FormulaAst {
    if (depth > MAX_DEPTH) throw new FormulaError("Formula is nested too deeply.");
    if (isOp("-")) {
      pos++;
      return { kind: "neg", arg: unary(depth + 1) };
    }
    return primary(depth);
  }

  function primary(depth: number): FormulaAst {
    const token = tokens[pos++];
    if (!token) throw new FormulaError("Formula ends unexpectedly.");
    if (token.type === "num") return { kind: "num", value: token.value };
    if (token.type === "ident") return { kind: "ref", name: token.value };
    if (token.value === "(") {
      const inner = expression(depth + 1);
      if (!isOp(")")) throw new FormulaError("Missing closing parenthesis.");
      pos++;
      return inner;
    }
    throw new FormulaError(`Unexpected "${token.value}" in formula.`);
  }

  const ast = expression(0);
  if (pos < tokens.length) throw new FormulaError(`Unexpected "${String(tokens[pos].value)}" in formula.`);
  return ast;
}

export function formulaRefs(ast: FormulaAst): string[] {
  const names = new Set<string>();
  const visit = (node: FormulaAst) => {
    if (node.kind === "ref") names.add(node.name);
    else if (node.kind === "neg") visit(node.arg);
    else if (node.kind === "bin") {
      visit(node.left);
      visit(node.right);
    }
  };
  visit(ast);
  return [...names];
}

export function evaluateFormula(ast: FormulaAst, values: Record<string, number>): number {
  const result = evaluate(ast, values);
  if (!Number.isFinite(result)) throw new FormulaError("Formula result is not a finite number.");
  return result;
}

function evaluate(node: FormulaAst, values: Record<string, number>): number {
  switch (node.kind) {
    case "num":
      return node.value;
    case "ref":
      // Object.hasOwn keeps inherited names such as "constructor" out.
      if (!Object.hasOwn(values, node.name)) throw new FormulaError(`Unknown column "${node.name}".`);
      return values[node.name];
    case "neg":
      return -evaluate(node.arg, values);
    case "bin": {
      const left = evaluate(node.left, values);
      const right = evaluate(node.right, values);
      if (node.op === "+") return left + right;
      if (node.op === "-") return left - right;
      if (node.op === "*") return left * right;
      if (right === 0) throw new FormulaError("Division by zero in formula.");
      return left / right;
    }
  }
}
