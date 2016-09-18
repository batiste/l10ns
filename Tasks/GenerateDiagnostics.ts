
/// <reference path='../Source/Service/Types.ts'/>

namespace L10ns.Tasks {
    interface DiagnosticDetails {
        category: 'Warning' | 'Error' | 'Message';
        code: number;
        isEarly?: boolean;
    }

    interface InputDiagnosticMessageTable {
        [msg: string]: DiagnosticDetails;
    }

    export function generateDiagnostics(grunt: IGrunt) {
        const path = require('path');
        if (!/Bundle/.test(__filename)) {
            return;
        }
        grunt.registerTask('generate-diagnostics', () => {
            let result =
                '// <auto-generated />\r\n' +
                '/// <reference path="Types.ts" />\r\n' +
                '/* @internal */\r\n' +
                'namespace L10ns {\r\n' +
                '    export const Diagnostics = {\r\n';
            const diagnosticMessages = require(path.join(__dirname, '../../Source/DiagnosticMessages.json')) as InputDiagnosticMessageTable;
            const names = Utilities.getObjectKeys(diagnosticMessages);
            const nameMap = buildUniqueNameMap(names);
            for (const key in diagnosticMessages) {
                var diagnosticDetails = diagnosticMessages[key];
                var propName = convertPropertyName(nameMap[key]);

                result +=
                    '        ' + propName +
                    ': { code: ' + diagnosticDetails.code +
                    ', category: DiagnosticCategory.' + diagnosticDetails.category +
                    ', key: "' + createKey(propName, diagnosticDetails.code) + '"' +
                    ', message: "' + key.replace(/[\"]/g, '\\"') + '"' +
                    ' },\r\n';
            }
            result += '    }\r\n}';
            console.log(result)
            L10ns.writeFile(L10ns.joinPath(__dirname, '../../Source/DiagnosticMessages.Generated.ts'), result);
        });
    }


    function buildUniqueNameMap(names: string[]): L10ns.Map<string> {
        let nameMap: L10ns.Map<string> = {};

        let uniqueNames = NameGenerator.ensureUniqueness(names, /* isCaseSensitive */ false, /* isFixed */ undefined);

        for (var i = 0; i < names.length; i++) {
            nameMap[names[i]] = uniqueNames[i];
        }

        return nameMap;
    }

    function createKey(name: string, code: number): string {
        return name.slice(0, 100) + '_' + code;
    }

    function convertPropertyName(origName: string): string {
        var result = origName.split("").map(char => {
            if (char === '*') { return "_Asterisk"; }
            if (char === '/') { return "_Slash"; }
            if (char === ':') { return "_Colon"; }
            return /\w/.test(char) ? char : "_";
        }).join("");


        // Get rid of all multi-underscores
        result = result.replace(/_+/g, "_");

        // Remove any leading underscore, unless it is followed by a number.
        result = result.replace(/^_([^\d])/, "$1")

        // Get rid of all trailing underscores.
        result = result.replace(/_$/, "");

        return result;
    }
}


namespace NameGenerator {
    export function ensureUniqueness(names: string[], isCaseSensitive: boolean, isFixed?: boolean[]): string[] {
        if (!isFixed) {
            isFixed = names.map(() => false)
        }

        var names = names.slice();
        ensureUniquenessInPlace(names, isCaseSensitive, isFixed);
        return names;
    }

    function ensureUniquenessInPlace(names: string[], isCaseSensitive: boolean, isFixed: boolean[]): void {
        for (var i = 0; i < names.length; i++) {
            var name = names[i];
            var collisionIndices = Utilities.collectMatchingIndices(name, names, isCaseSensitive);

            // We will always have one "collision" because getCollisionIndices returns the index of name itself as well;
            // so if we only have one collision, then there are no issues.
            if (collisionIndices.length < 2) {
                continue;
            }

            handleCollisions(name, names, isFixed, collisionIndices, isCaseSensitive);
        }
    }

    function handleCollisions(name: string, proposedNames: string[], isFixed: boolean[], collisionIndices: number[], isCaseSensitive: boolean): void {
        var suffix = 1;

        for (var i = 0; i < collisionIndices.length; i++) {
            var collisionIndex = collisionIndices[i];

            if (isFixed[collisionIndex]) {
                // can't do anything about this name.
                continue;
            }

            while (true) {
                var newName = name + suffix;
                suffix++;

                // Check if we've synthesized a unique name, and if so
                // replace the conflicting name with the new one.
                if (!proposedNames.some(name => Utilities.stringEquals(name, newName, isCaseSensitive))) {
                    proposedNames[collisionIndex] = newName;
                    break;
                }
            }
        }
    }
}

namespace Utilities {
    /// Return a list of all indices where a string occurs.
    export function collectMatchingIndices(name: string, proposedNames: string[], isCaseSensitive: boolean): number[] {
        var matchingIndices: number[] = [];

        for (var i = 0; i < proposedNames.length; i++) {
            if (stringEquals(name, proposedNames[i], isCaseSensitive)) {
                matchingIndices.push(i);
            }
        }

        return matchingIndices;
    }

    export function stringEquals(s1: string, s2: string, caseSensitive: boolean): boolean {
        if (caseSensitive) {
            s1 = s1.toLowerCase();
            s2 = s2.toLowerCase();
        }

        return s1 == s2;
    }

    // Like Object.keys
    export function getObjectKeys(obj: any): string[] {
        var result: string[] = [];

        for (var name in obj) {
            if (obj.hasOwnProperty(name)) {
                result.push(name);
            }
        }

        return result;
    }
}

module.exports = L10ns.Tasks.generateDiagnostics;
