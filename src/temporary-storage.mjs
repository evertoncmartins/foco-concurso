// A fresh instance for every guest session; nothing is written to browser storage.
export class TemporaryStorage {
  #values=new Map();
  get length(){return this.#values.size;}
  key(index){return [...this.#values.keys()][index]??null;}
  getItem(key){return this.#values.get(String(key))??null;}
  setItem(key,value){this.#values.set(String(key),String(value));}
  removeItem(key){this.#values.delete(String(key));}
  clear(){this.#values.clear();}
}
