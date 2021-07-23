import * as process from 'process'
import fs from 'fs'
import * as path from 'path'
import {annotationsForPath, getAllFiles} from '../src/annotations'

beforeAll(() => {
  jest.spyOn(fs, 'existsSync').mockReturnValue(true)
  process.env['GITHUB_WORKSPACE'] = __dirname
})

test('parses file', async () => {
  const spotBugsXml = path.resolve(
    __dirname,
    '..',
    'reports',
    'spotbugsXml.xml'
  )
  const annotations = annotationsForPath(spotBugsXml, true)
  expect(annotations).toHaveLength(12)
})

/*
test('gets all files in directory recursive', async() => {
  const result = getAllFiles('/home/jakob', '.txt');
  //console.log(`Number of files found: ${result.length}`);
  expect(result).toHaveLength(1)
})*/