import * as core from '@actions/core'
import {BugPattern, FindbugsResult, SourceLine} from './spotbugs'
import parser from 'fast-xml-parser'
import fs, { PathLike } from 'fs'
import * as path from 'path'
import {Annotation, AnnotationLevel} from './github'
import {fromString as htmlToText, HtmlToTextOptions} from 'html-to-text'
import decode from 'unescape'
import {memoizeWith, identity, indexBy, chain} from 'ramda'

const HTML_TO_TEXT_OPTIONS: HtmlToTextOptions = {
  wordwrap: false,
  preserveNewlines: false,
  uppercaseHeadings: false
}

const XML_PARSE_OPTIONS = {
  allowBooleanAttributes: true,
  ignoreAttributes: false,
  attributeNamePrefix: ''
}

function asArray<T>(arg: T[] | T | undefined | any[]): T[] {
  return !arg ? [] : Array.isArray(arg) ? arg : [arg]
}

export function getAllFiles(dir: string, extn: string, files?: string[], result?: any, regex?:any): string[] {
  const filesLocal = files || fs.readdirSync(dir);
  let resultLocal = result || [];
  const regexLocal = regex || new RegExp(`\\${extn}$`)
 
  for (let i = 0; i < filesLocal.length; i++) {
      let file = path.join(dir, filesLocal[i]);
      if (fs.statSync(file).isDirectory()) {
          try {
              resultLocal = getAllFiles(file, extn, fs.readdirSync(file), resultLocal, regexLocal);
          } catch (error) {
              continue;
          }
      } else {
          if (regexLocal.test(file)) {
              resultLocal.push(file);
          }
      }
  }
  return resultLocal;
}

export function annotationsForPath(resultFile: string, skipSourceCheck: boolean = false): Annotation[] {
  core.info(`Creating annotations for ${resultFile}`)
  const root: string = process.env['GITHUB_WORKSPACE'] || ''

  const result: FindbugsResult = parser.parse(
    fs.readFileSync(resultFile, <const>'UTF-8'),
    XML_PARSE_OPTIONS
  )

  const violations = asArray(result?.BugCollection?.BugInstance)
  const bugPatterns: {[type: string]: BugPattern} = indexBy(
    a => a.type,
    asArray(result?.BugCollection?.BugPattern)
  )
  core.info(`${resultFile} has ${violations.length} violations`)

  return chain(BugInstance => {
    const annotationsForBug: Annotation[] = []
    const sourceLines = asArray(BugInstance.SourceLine)
    const primarySourceLine: SourceLine | undefined = (sourceLines.length > 1) ? sourceLines.find(sl => sl.primary) : sourceLines[0]
    const sourceFileName: string | undefined = primarySourceLine ? primarySourceLine?.sourcepath?.split('\\')?.pop()?.split('/').pop() : 'null';
    const resolvedSourceFiles = getAllFiles(root, sourceFileName || '')
    const selectedSourceFile: string = resolvedSourceFiles.length > 0 ? resolvedSourceFiles[0] : ''
    if (resolvedSourceFiles.length > 1) {
      core.warning(`Resolved ${resolvedSourceFiles.length} source files for ${sourceFileName}, will use first one!`)
    }
    if (skipSourceCheck) {
      core.warning(`Source file check is disabled, this should only be used for testing.`)
    }
    if (primarySourceLine?.start && (selectedSourceFile || skipSourceCheck)) {
      const annotation: Annotation = {
        annotation_level: AnnotationLevel.warning,
        path: path.relative(
          root,
          selectedSourceFile
        ),
        start_line: Number(primarySourceLine?.start || 1),
        end_line: Number(
          primarySourceLine?.end || primarySourceLine?.start || 1
        ),
        title: BugInstance.type,
        message: BugInstance.LongMessage,
        raw_details: htmlToText(
          decode(bugPatterns[BugInstance.type].Details),
          HTML_TO_TEXT_OPTIONS
        )
      }
      core.info(`Created annotation ${annotation.title} with message ${annotation.message}`)
      annotationsForBug.push(annotation)
    } else {
      core.info(
        `Skipping bug instance because source line start or source directory are missing`
      )
    }
    return annotationsForBug
  }, violations)
}
