// Tests of the tool that breaks the code on purpose (scripts/mutation-lib.mjs).
// If the tool changed text in a string or a comment, its report about the tests would be wrong.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMutant,
  codeMask,
  describeMutant,
  findMutants,
  isValidSyntax,
  seededShuffle,
} from '../scripts/mutation-lib.mjs';

const mutate = (source, operator) =>
  findMutants(source)
    .filter((mutant) => mutant.operator === operator)
    .map((mutant) => applyMutant(source, mutant));

test('codeMask marks code, and leaves out strings, comments, regular expressions and template text', () => {
  const source = "a('x === y'); // z === w\n/* q === r */ b(/a===b/g); c(`p === q ${d === e}`);";
  const mask = codeMask(source);
  const codeOnly = [...source].filter((_, index) => mask[index]).join('');
  assert.ok(codeOnly.includes('d === e'), 'the code in ${} is code');
  for (const text of ['x === y', 'z === w', 'q === r', 'a===b', 'p === q']) {
    assert.ok(!codeOnly.includes(text), `${text} is not code`);
  }
});

test('the operators change code only', () => {
  const source = "const s = 'a === b'; // c === d\nconst r = /e===f/; const t = `g === h`; const x = i === j;";
  assert.deepEqual(mutate(source, 'equal to not equal'), [source.replace('i === j', 'i !== j')]);
});

test('a slash after a name or a number is a division, and a slash after an operator starts a regular expression', () => {
  const division = 'const a = b / c / d; const x = e === f;';
  assert.equal(mutate(division, 'equal to not equal').length, 1, 'the code after a division is still code');
  const regex = 'const a = b ? /x===y/ : 1; const z = e === f;';
  assert.equal(mutate(regex, 'equal to not equal').length, 1, 'the regular expression is not code');
  const keyword = 'function f() { return /x===y/.test(a) && g === h; }';
  assert.equal(mutate(keyword, 'equal to not equal').length, 1, 'a slash after return starts a regular expression');
});

test('each operator makes the change that its name says', () => {
  assert.deepEqual(mutate('x = a && b;', 'and to or'), ['x = a || b;']);
  assert.deepEqual(mutate('x = a || b;', 'or to and'), ['x = a && b;']);
  assert.deepEqual(mutate('x = a < b;', 'less than to less or equal'), ['x = a <= b;']);
  assert.deepEqual(mutate('x = a <= b;', 'less or equal to less than'), ['x = a < b;']);
  assert.deepEqual(mutate('x = a > b;', 'greater than to greater or equal'), ['x = a >= b;']);
  assert.deepEqual(mutate('x = a >= b;', 'greater or equal to greater than'), ['x = a > b;']);
  assert.deepEqual(mutate('x = a !== b;', 'not equal to equal'), ['x = a === b;']);
  assert.deepEqual(mutate('x = true;', 'true to false'), ['x = false;']);
  assert.deepEqual(mutate('x = false;', 'false to true'), ['x = true;']);
  assert.deepEqual(mutate('x = 41;', 'number plus one'), ['x = 42;']);
  assert.deepEqual(mutate('x = !done;', 'remove not'), ['x = done;']);
  assert.deepEqual(mutate('x = n + 1;', 'plus one to minus one'), ['x = n - 1;']);
  assert.deepEqual(mutate('x = n - 1;', 'minus one to plus one'), ['x = n + 1;']);
});

test('the operators leave alone what is not a comparison, a name or a number', () => {
  assert.deepEqual(mutate('x = a && b; y = a != b; z = (a) => b;', 'and to or'), [
    'x = a || b; y = a != b; z = (a) => b;',
  ]);
  assert.equal(
    findMutants('x = a.b3; y = $1;').filter((mutant) => mutant.operator === 'number plus one').length,
    0,
    'a digit inside a name',
  );
  assert.equal(
    findMutants('x = a !== b;').filter((mutant) => mutant.operator === 'remove not').length,
    0,
    'the ! of !==',
  );
  assert.equal(
    findMutants('x = 1.5;').filter((mutant) => mutant.operator === 'number plus one').length,
    0,
    'a decimal number',
  );
  assert.equal(
    findMutants('f(a => b);').filter((mutant) => mutant.operator === 'greater than to greater or equal').length,
    0,
    'an arrow',
  );
});

test('an if condition is negated as a whole', () => {
  assert.deepEqual(mutate('if (a && (b || c)) { x(); }', 'negate if'), ['if (!(a && (b || c))) { x(); }']);
  assert.deepEqual(
    mutate("if (s.includes(')')) { x(); }", 'negate if'),
    ["if (!(s.includes(')'))) { x(); }"],
    'a ) in a string does not end the condition',
  );
  assert.deepEqual(mutate("// if (a) {}\nconst s = 'if (b) {}';", 'negate if'), [], 'not in a comment or a string');
});

test('a statement on one line can be deleted, a declaration or a return cannot', () => {
  const source = [
    '  foo(1, 2);',
    '  obj.x = 5;',
    '  const y = bar();',
    '  return baz();',
    '  total += 2;',
    '  call(',
    '    a);',
  ].join('\n');
  const deleted = findMutants(source)
    .filter((mutant) => mutant.operator === 'delete statement')
    .map((mutant) => source.slice(mutant.start, mutant.end));
  assert.deepEqual(deleted, ['foo(1, 2);', 'obj.x = 5;', 'total += 2;']);
});

test('applyMutant replaces only the range of the mutant', () => {
  const source = 'aaa === bbb === ccc';
  const [first, second] = findMutants(source).filter((mutant) => mutant.operator === 'equal to not equal');
  assert.equal(applyMutant(source, first), 'aaa !== bbb === ccc');
  assert.equal(applyMutant(source, second), 'aaa === bbb !== ccc');
  assert.equal(first.line, 1);
  assert.equal(findMutants('\n\nx = a === b;')[0].line, 3);
});

test('isValidSyntax tells a text that esbuild can read from one that it cannot', () => {
  assert.equal(isValidSyntax('const a: number = 1;', 'a.ts'), true);
  assert.equal(isValidSyntax('const a: number = 1;', 'a.js'), false, 'a type in a .js file');
  assert.equal(isValidSyntax('const a = ;', 'a.ts'), false);
  assert.equal(isValidSyntax('if (', 'a.mjs'), false);
  assert.equal(isValidSyntax('if (', 'a.cjs'), false);
  assert.equal(isValidSyntax('a { color: red; ', 'a.css'), true, 'CSS is not checked');
});

test('seededShuffle gives the same order for the same seed, and every item once', () => {
  const items = Array.from({ length: 20 }, (_, index) => index);
  const one = seededShuffle(items, 7);
  assert.deepEqual(seededShuffle(items, 7), one);
  assert.notDeepEqual(seededShuffle(items, 8), one);
  assert.notDeepEqual(one, items);
  assert.deepEqual(
    [...one].sort((a, b) => a - b),
    items,
  );
  assert.deepEqual(
    items,
    Array.from({ length: 20 }, (_, index) => index),
    'the input does not change',
  );
});

test('a backslash in a string hides one character, so a string can end with an escaped backslash', () => {
  const source = "const s = '\\\\'; const x = a === b; const t = 'it\\'s'; const y = c === d;";
  assert.equal(mutate(source, 'equal to not equal').length, 2, 'the code after each string is code');
  const quoted = 'const s = "say \\"hi\\""; const x = a === b;';
  assert.equal(mutate(quoted, 'equal to not equal').length, 1);
});

test('describeMutant shows the change on one line and cuts long text at 70 characters', () => {
  const source = 'const result = value === 1;';
  const [mutant] = findMutants(source).filter((candidate) => candidate.operator === 'equal to not equal');
  const text = describeMutant(source, mutant);
  assert.match(text, /^equal to not equal: === -> !==   \| const result = value === 1;$/);

  const long = `const value = ${'x'.repeat(100)} === other;`;
  const [longMutant] = findMutants(long).filter((candidate) => candidate.operator === 'equal to not equal');
  const shown = describeMutant(long, longMutant).split('   | ')[1];
  assert.equal(shown.length, 70, 'the line is cut at 70 characters');
  assert.ok(shown.endsWith('...'));
  assert.equal(shown, `${long.slice(0, 67)}...`);
});
