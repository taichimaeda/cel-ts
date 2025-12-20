# TODO

- Find in this port where it uses functional pattern where its more natural in typescript to model them as classes - and acc rewrite using classe
- There are many instances of class defs where it doesn't use shorthand syntax and instead takes parameters in constructors and assigns them to fields manually - rewrite them using shorthand syntax
- also there are classes that use underscore-prefixed fields and expose not underscore-prefixed versions as getter methods - these are redudnant. just expose readonly, public fields
- also there are many uses of public modifier - this shouldn't be necessary unless it lacks consistency too much (like in classes with lots of both pulic and private members)
- also the current impl doesn't support struct types - in cel go if i understand correctly users can supply types and specify which variables in env have which type, but this isn't really implemented in the type checker - add impl
- also add conformance test from cel-go - you can find local copy of the repo under ~/workspace/projects/cel-go - you'll need to copy those proto and install protobuf toolchain for this arch linux laptop if necessary
- also add benchmarking test - this doesn't have to be exhaustive, just a few and also visualise the result using js-native library. use pnpm for package management.

