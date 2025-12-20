# TODO

## Tasks (by User)

- Find in this port where it uses functional pattern where its more natural in typescript to model them as classes - and acc rewrite using classe - ive asked you before but im asking you again because there are many places where this is relevant. check each directory under src/, and make a task for each: (DONE)
  - interpreter
  - parser
  - checker
  - common
  - formatter
- There are many instances of class defs where it doesn't use shorthand syntax and instead takes parameters in constructors and assigns them to fields manually - rewrite them using shorthand syntax (DONE)
- also there are classes that assign constant values to their fields in constructor - these can be replaced by simply declaring those fields with initialisers like private name = "CELError" instead of this.name = "CELError" - fix all such instances (DONE)
- also there are classes that use underscore-prefixed fields and expose not underscore-prefixed versions as getter methods - these are redudnant. just expose readonly, public fields. use getters only if you need lazy eval or derived values (DONE)
- also there are many uses of public modifier for fields - this shouldn't be necessary unless it lacks consistency too much (like in classes with lots of both pulic and private members) (DONE)
- also the current impl doesn't support struct types - in cel go if i understand correctly users can supply types and specify which variables in env have which type, but this isn't really implemented in the type checker - add impl
- also add conformance test from cel-go - you can find local copy of the repo under ~/workspace/projects/cel-go - you'll need to copy those proto and install protobuf toolchain for this arch linux laptop if necessary
- also add benchmarking test - this doesn't have to be exhaustive, just a few and also visualise the result using js-native library. use pnpm for package management.
- be consistent about the uses of interfaces. this is a cel-go port menaing there are lots of places where base class would have been sufficient for typescript but still using interfaces as redudantn abstractions. remove those and rewrite in terms of classes if any.
- also there are places where operators like `_+_` and `_?_:_` are hardcoded as strings even tho we have Operators const defined in parser.ts - can you replace these hardcoded string with this const object's members? and also i feel like this Operators const acc belongs to common/ast.ts rather than parser
- also make a new test/official directory, and copy the official test cases from cel-go and do equivalent tests using this cel-ts impl. some of them might be redudantn because of how re-architected cel-ts, but some core tests like parser, type checker, planner and interpreter should be availale imo. keep the proptest which ive added to cel-ts because it isn't available in cel-go
- also experiment with the idea of linter for CEL. add new source code under src/linter. not sure if there's much linting rules for CEL because it only has expressions, but i think expressions like `true || a` for example should be redundant (it can be replaced by `a`). come up with more creative but actually useful linting rules if any. and this should be designed with care so its modular and open to adding new rules.
- also experiemnt with the idea of adding lsp support for CEL language using the functionality of cel-ts. add relevant source code under src/lsp. unlike real lsp server there's no need to communicate via unix socket or stdin/stdout - you only need to provide relevant methods in TypeScript with similar interface, so ts clients can invoke them as library. im thinking autocomplete (of env vars), querying the type/def of env vars (for hover), signature help for functions (standard/custom), errors/warnings/lints diagnostics, code actions like quick fixes for trivial lint errors, and formatting support, semantic tokens for better highlighting, document highlights (highlight same symbols in cel exp), and folding ranges would be nice. you should make each of these as an independent task, and add impl under each directory under /src/lsp, like src/lsp/diagnostics
- similarly the current impl doesn't support protobuf types as user input struct types - which i think cel-go supports. add relevant impl. this might be rather complicated, so add a new folder under checker like /src/checker/grpc if thats the case, but other wise making a new grpc file is fine.

## Tasks (by Agent)

## Reminder

read this file, and turn them into your own task list.
after completing each task, you must revisit this file and check for any updates made while you were working on that task. the order of the task list in this TODO.md may have changed too, in which case you should reorder your task list accordingly.
and when you're done, feel free to edit this TODO.md and add (DONE) at the end of each task item paragraph.
also make sure to run pnpm test and pnpm typecheck before moving onto the next task.
also update README.md and docs/*-architecture.md if there's relevant changes. run pnpm typecheck before running pnpm test.
also feel free to add tasks to this TODO.md under Tasks (by Agent) section if you spot potential issues or improvements with this cel-ts implementation while you were working on other tasks. the priority of these tasks should be after the tasks that's originally provided by the user - so only process these if all user tasks are complete

## Important

if you're about to run out of context, always make sure to read TODO.md, construct task list and start working on it immediately without asking me - i don't want you to stop working while im 
