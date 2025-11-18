interface ObjectConstructor {
    groupBy: <T>(
        items: Iterable<T>,
        callbackFn: (element: T, index: number) => string
    ) => Record<string, T[]>;
}

// eslint-disable-next-line no-var
declare var Object: ObjectConstructor;

Object.groupBy ??= function <T>(
    items: Iterable<T>,
    callbackFn: (element: T, index: number) => string
): Record<string, T[]> {
    const groups: Record<string, T[]> = Object.create(null);
    let i = 0;

    for (const element of items) {
        const key = callbackFn(element, i++);

        const cached = groups[key];
        const groupList = cached ?? [];

        groupList.push(element);

        if (!cached) {
            groups[key] = groupList;
        }
    }

    return groups;
};

interface MapConstructor {
    groupBy: <T>(
        items: Iterable<T>,
        callbackFn: (element: T, index: number) => string
    ) => Map<string, T[]>;
}

// eslint-disable-next-line no-var
declare var Map: MapConstructor;

Map.groupBy ??= function <T>(
    items: Iterable<T>,
    callbackFn: (element: T, index: number) => string
): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    let i = 0;

    for (const element of items) {
        const key = callbackFn(element, i++);

        const cached = groups.get(key);
        const groupList = cached ?? [];

        groupList.push(element);

        if (!cached) {
            groups.set(key, groupList);
        }
    }

    return groups;
};
