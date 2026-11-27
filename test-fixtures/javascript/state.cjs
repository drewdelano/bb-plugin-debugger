function compute(limit) {
  const state = {
    count: 0,
    nested: {
      label: "ready",
      values: [2, 4, 6],
      meta: { enabled: true, note: null },
    },
    items: [{ id: 1 }, { id: 2 }],
  };

  for (let index = 0; index < limit; index += 1) {
    state.count += index;
    console.log(`iteration:${index}:count:${state.count}`);
  }

  return state.count;
}

console.log(`result:${compute(4)}`);
