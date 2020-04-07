
/* auto */ import { CountNumericIdNormal } from './../vpcutils/vpcUtils';
/* auto */ import { BuildFakeTokens, ChvITk, ChvITkType, listOfAllWordLikeTokens, tks } from './../codeparse/vpcTokens';
/* auto */ import { O, checkThrow } from './../../ui512/utils/util512Assert';
/* auto */ import { Util512, checkThrowEq, last } from './../../ui512/utils/util512';


export class VpcRewritesGlobal {
    static rewriteSpecifyCdOrBgPart(line: ChvITk[]): ChvITk[] {
        let ret: ChvITk[] = [];
        let copyLine = line.slice();
        copyLine.reverse();
        for (let i = 0; i < copyLine.length - 1; i++) {
            let insertIt: O<ChvITkType>;
            let s = '';
            if (
                copyLine[i].tokenType === tks.tkBtn ||
                copyLine[i].tokenType === tks.tkFld
            ) {
                let next = copyLine[i + 1];
                if (next.tokenType !== tks.tkCard && next.tokenType !== tks.tkBg) {
                    insertIt =
                        copyLine[i].tokenType === tks.tkFld ? tks.tkBg : tks.tkCard;
                    s = copyLine[i].tokenType === tks.tkFld ? 'bg' : 'cd';
                }
            }

            ret.push(copyLine[i]);
            if (insertIt) {
                ret.push(BuildFakeTokens.inst.makeTk(copyLine[i], insertIt, s));
            }
        }

        ret.push(last(copyLine));
        ret.reverse();
        return ret;
    }
}

/**
 * helps rewrite code
   example:
   `
    put %ARG0% into x
    put %ARG1% into $loopbound%UNIQUE%
    repeat
        if x >= $loopbound%UNIQUE% then
            exit repeat
        end if
        put x + 1 into x
        %SYNPLACEHOLDER%
        %ARGMANY%
    end repeat`
 */
export namespace VpcSuperRewrite {
    export const CounterForUniqueNames = new CountNumericIdNormal();
    export function go(
        s: string,
        realTokenAsBasis: ChvITk,
        args: ChvITk[][],
        argMany?: ChvITk[][]
    ): ChvITk[][] {
        let ret: ChvITk[][] = [];
        s = s.trim();
        s = s.replace(/%UNIQUE%/g, '$unique' + CounterForUniqueNames.nextAsStr());
        let lines = s.replace(/\r\n/g, '\n').split('\n');
        for (let line of lines) {
            if (line.trim() === '%ARGMANY%' && argMany) {
                Util512.extendArray(ret, argMany);
            } else {
                let terms = line.split(/\s+/);
                ret.push([]);
                for (let term of terms) {
                    addTerm(ret, term, args, realTokenAsBasis);
                }
            }
        }
        return ret;
    }

    function addTerm(
        ret: ChvITk[][],
        term: string,
        args: ChvITk[][],
        realTokenAsBasis: ChvITk
    ) {
        if (term.startsWith('%ARG')) {
            checkThrowEq('%', term[term.length - 1], '');
            let sn = term.replace(/%ARG/g, '').replace(/%/g, '');
            let n = Util512.parseIntStrict(sn);
            checkThrow(
                typeof n === 'number' && n >= 0 && n < args.length,
                'internal error in template'
            );
            Util512.extendArray(last(ret), args[n]);
        } else {
            let newToken = tokenFromEnglishTerm(term, realTokenAsBasis);
            last(ret).push(newToken);
        }
    }

    export function tokenFromEnglishTerm(term: string, realTokenAsBasis: ChvITk) {
        let tktype = listOfAllWordLikeTokens[term];
        if (!tktype && term.startsWith('"') && term.endsWith('"')) {
            // we can make a simple string literal, not one that contains spaces though.
            tktype = tks.tkStringLiteral;
        } else if (!tktype && term.match(/^[0-9]+$/)) {
            tktype = tks.tkNumLiteral;
        } else if (!tktype) {
            tktype = tks.tkIdentifier;
            checkThrow(
                term.match(/^[a-zA-Z$][0-9a-zA-Z$]*$/),
                'internal error in template, not a known symbol or valid tkidentifier'
            );
        }

        return BuildFakeTokens.inst.makeTk(realTokenAsBasis, tktype, term);
    }

    export function replaceEnglishTermTokenOnceWithEnglishTermToken(
        line: ChvITk[],
        realTokenAsBasis: ChvITk,
        term1: string,
        term2: string
    ) {
        let tk1 = tokenFromEnglishTerm(term1, realTokenAsBasis);
        let index = line.findIndex(
            t => t.tokenType === tk1.tokenType && t.image === tk1.image
        );
        if (index !== -1) {
            let tk2 = tokenFromEnglishTerm(term2, line[index]);
            line[index] = tk2;
            return true;
        }
        return false;
    }

    export function replaceWithSyntaxMarkerAtLvl0(line: ChvITk[],
        realTokenAsBasis: ChvITk,
        term: string,
        syntaxMarkerType='') {
            let index = searchTokenGivenEnglishTermInParensLevel(0, line, realTokenAsBasis, term)
            if (index === -1) {
                return false
            } else {
                let marker = BuildFakeTokens.inst.makeSyntaxMarker(realTokenAsBasis, syntaxMarkerType)
                line[index] = marker
                return true
            }
        }

        export function searchTokenGivenEnglishTerm(
        line: ChvITk[],
        realTokenAsBasis: ChvITk,
        term: string
    ) {
        let tk1 = tokenFromEnglishTerm(term, realTokenAsBasis);
        return line.findIndex(
            t => t.tokenType === tk1.tokenType && t.image === tk1.image
        );
    }

    export function searchTokenGivenEnglishTermInParensLevel(
        wantedLevel: number,
        line: ChvITk[],
        realTokenAsBasis: ChvITk,
        term: string
    ) {
        let tk1 = tokenFromEnglishTerm(term, realTokenAsBasis);
        let lvl = 0;
        for (let i = 0; i < line.length; i++) {
            let t = line[i];
            if (t.tokenType === tks.tkLParen) {
                lvl += 1;
            } else if (t.tokenType === tks.tkRParen) {
                lvl -= 1;
            } else if (
                t.tokenType === tk1.tokenType &&
                t.image === tk1.image &&
                lvl === wantedLevel
            ) {
                return i;
            }
        }
        return -1;
    }

    export function generateUniqueVariable(realTokenAsBasis: ChvITk, prefix: string) {
        let image = '$unique_' + prefix + VpcSuperRewrite.CounterForUniqueNames.nextAsStr();
        return BuildFakeTokens.inst.makeTk(realTokenAsBasis, tks.tkIdentifier, image);
    }
}
