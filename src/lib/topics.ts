import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

export interface Topic {
  id: string;
  title: string;
}

// Путь от корня проекта, а не от import.meta.url: после сборки модуль лежит
// в чанке внутри dist/, и относительный адрес оттуда уводит мимо data/.
// Все цели Makefile запускают astro из корня, так что cwd — это он.
const file = resolve(process.cwd(), 'data/topics.yaml');

export const topics: Topic[] = parse(readFileSync(file, 'utf8'));

if (!Array.isArray(topics) || topics.length === 0) {
  throw new Error('data/topics.yaml: ожидается непустой список тем');
}

export const topicIds = topics.map((topic) => topic.id) as [string, ...string[]];

const titles = new Map(topics.map((topic) => [topic.id, topic.title]));

export const topicTitle = (id: string): string => titles.get(id) ?? id;
