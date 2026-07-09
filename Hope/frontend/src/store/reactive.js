/**
 * Simple Reactive System - Lightweight reactivity for state management
 * No external dependencies, ~50 lines
 */

// WeakMap to store subscribers for each reactive object
const subscribers = new WeakMap();
let activeEffect = null;

function track(target, key) {
  if (!activeEffect) return;

  let deps = subscribers.get(target);
  if (!deps) {
    deps = new Map();
    subscribers.set(target, deps);
  }

  let dep = deps.get(key);
  if (!dep) {
    dep = new Set();
    deps.set(key, dep);
  }

  dep.add(activeEffect);
}

function trigger(target, key) {
  const deps = subscribers.get(target);
  if (!deps) return;

  const dep = deps.get(key);
  if (!dep) return;

  dep.forEach(effect => effect());
}

/**
 * Create a reactive object
 * @param {Object} target - The object to make reactive
 * @returns {Object} - Reactive proxy
 */
export function reactive(target) {
  return new Proxy(target, {
    get(target, key, receiver) {
      track(target, key);
      return Reflect.get(target, key, receiver);
    },
    set(target, key, value, receiver) {
      const result = Reflect.set(target, key, value, receiver);
      trigger(target, key);
      return result;
    }
  });
}

/**
 * Create a computed property
 * @param {Function} getter - Function that computes the value
 * @returns {Object} - Object with .value getter
 */
export function computed(getter) {
  let value;
  let dirty = true;

  const effect = () => {
    dirty = true;
  };

  const obj = {
    get value() {
      if (dirty) {
        activeEffect = effect;
        value = getter();
        activeEffect = null;
        dirty = false;
      }
      return value;
    }
  };

  return obj;
}

/**
 * Create a ref (reactive primitive)
 * @param {*} initialValue - Initial value
 * @returns {Object} - Ref object with .value
 */
export function ref(initialValue) {
  const obj = {
    get value() {
      track(obj, 'value');
      return initialValue;
    },
    set value(newVal) {
      initialValue = newVal;
      trigger(obj, 'value');
    }
  };
  return obj;
}

/**
 * Watch for changes
 * @param {Object|Function} source - Reactive object or getter
 * @param {Function} callback - Callback function
 */
export function watch(source, callback) {
  let getter;
  if (typeof source === 'function') {
    getter = source;
  } else {
    getter = () => source.value;
  }

  let oldValue = getter();

  const effect = () => {
    const newValue = getter();
    if (newValue !== oldValue) {
      callback(newValue, oldValue);
      oldValue = newValue;
    }
  };

  activeEffect = effect;
  getter(); // Initial run to track dependencies
  activeEffect = null;
}

/**
 * Effect - runs callback whenever dependencies change
 * @param {Function} callback
 */
export function effect(callback) {
  const run = () => {
    activeEffect = run;
    callback();
    activeEffect = null;
  };
  run();
}