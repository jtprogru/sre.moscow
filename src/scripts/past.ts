// Прошедшие события уезжают в архив при сборке. Сборка идёт раз в сутки, но
// GitHub отключает расписание после 60 дней без активности в репозитории, и
// тогда страница начнёт врать. Этот скрипт убирает из списка предстоящих то,
// что уже закончилось, и говорит об этом читателю.
//
// Без JS список остаётся таким, каким его собрали.

export function dropPast(): void {
  const now = Date.now();
  let dropped = 0;

  for (const list of document.querySelectorAll<HTMLElement>('[data-upcoming]')) {
    for (const item of list.querySelectorAll<HTMLElement>('[data-ends]')) {
      if (Date.parse(item.dataset.ends ?? '') < now) {
        item.remove();
        dropped += 1;
      }
    }
    for (const group of list.querySelectorAll<HTMLElement>('[data-group]')) {
      if (!group.querySelector('[data-ends]')) group.remove();
    }
  }

  if (dropped === 0) return;
  for (const note of document.querySelectorAll<HTMLElement>('[data-stale-note]')) note.hidden = false;
}
