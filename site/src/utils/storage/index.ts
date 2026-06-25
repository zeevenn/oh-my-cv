import { downloadFile } from "@renovamen/utils";
import type { ValidVersion } from "~/composables/constant";
import { LocalForageDbService } from "./localForage";
import { setResume, IsValid } from "./utils";
import { MigrateService } from "./migrate";
import type {
  DbService,
  StorageJson,
  StorageJsonData,
  DbResumeUpdate,
  DbResumeEmpty,
  DbResume
} from "./db";

const AVAILABLE_SERVICES: Record<string, DbService> = {
  localForage: new LocalForageDbService()
  // TODO: Support PGlite: https://github.com/electric-sql/pglite
};

export type StorageChange =
  | {
      type: "create" | "update";
      resume: DbResume;
    }
  | {
      type: "delete";
      resume: DbResume;
    }
  | {
      type: "import";
    };

export type StorageChangeListener = (change: StorageChange) => void | Promise<void>;

export class StorageService {
  private _db: DbService;
  private _version: ValidVersion;
  private _listeners = new Set<StorageChangeListener>();
  private _suppressChangeEvents = false;

  constructor(service: keyof typeof AVAILABLE_SERVICES) {
    const { VERSION } = useConstant();

    this._version = VERSION.CURRENT;
    this._db = AVAILABLE_SERVICES[service];
  }

  private _createEmptyResume(): DbResumeEmpty {
    const { DEFAULT } = useConstant();

    return {
      name: DEFAULT.RESUME_NAME,
      markdown: DEFAULT.MD_CONTENT,
      css: DEFAULT.CSS_CONTENT,
      styles: DEFAULT.STYLES
    };
  }

  private _emitChange(change: StorageChange) {
    if (this._suppressChangeEvents) return;

    for (const listener of this._listeners) {
      Promise.resolve(listener(change)).catch((error) => {
        console.error("Storage change listener error:", error);
      });
    }
  }

  public onChange(listener: StorageChangeListener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  public async getResumes() {
    const { data, error } = await this._db.queryAll();

    if (error) {
      // TODO: Use toast to show error message
      console.error("Get resumes error:", error.message);
    }

    return data ?? [];
  }

  public async getStorageData(): Promise<StorageJsonData> {
    return (await this.getResumes()).reduce((acc, { id, ...resume }) => {
      acc[id] = resume;
      return acc;
    }, {} as StorageJsonData);
  }

  public async replaceStorageData(data: StorageJsonData) {
    this._suppressChangeEvents = true;

    try {
      const current = await this.getResumes();
      const incomingIds = new Set(Object.keys(data).map(Number));

      for (const resume of current) {
        if (!incomingIds.has(resume.id)) await this._db.delete(resume.id);
      }

      for (const [_id, resume] of Object.entries(data)) {
        const id = Number(_id);
        const { data: existing, error } = await this._db.queryById(id);

        if (error) {
          console.error("Replace storage error:", error.message);
          continue;
        }

        if (existing) {
          await this._db.update({ id, ...resume }, false);
        } else {
          await this._db.create({ id, ...resume });
        }
      }
    } finally {
      this._suppressChangeEvents = false;
    }
  }

  public async updateResume(
    data: DbResumeUpdate,
    newUpdateTime = true,
    options: { silent?: boolean } = {}
  ) {
    const { data: updatedData, error } = await this._db.update(data, newUpdateTime);

    if (error) {
      // TODO: Use toast to show error message
      console.error("Update error:", error.message);
    } else {
      if (!options.silent) {
        const toast = useToast();
        toast.save();
      }
      this._emitChange({ type: "update", resume: updatedData! });
    }

    return updatedData;
  }

  public async createResume() {
    const { data, error } = await this._db.create(this._createEmptyResume());

    if (error) {
      // TODO: Use toast to show error message
      console.error("Create error:", error.message);
    } else {
      const toast = useToast();
      toast.new();
      this._emitChange({ type: "create", resume: data! });
    }

    return data;
  }

  public async deleteResume(id: number) {
    const { data, error } = await this._db.delete(id);

    if (error) {
      // TODO: Use toast to show error message
      console.error("Delete error:", error.message);
    } else {
      const toast = useToast();
      toast.delete(data!.name);
      this._emitChange({ type: "delete", resume: data! });
    }

    return data;
  }

  public async switchToResume(id: number) {
    const { setData } = useDataStore();

    setData("loaded", false);

    const { data, error } = await this._db.queryById(id);

    if (error) {
      // TODO: Use toast to show error message
      console.error("Switch error:", error.message);
    } else if (!data) {
      // TODO: Use toast to show error message
      console.error(`Switch error: Resume ${id} not found.`);
    } else {
      await setResume(data!);

      const toast = useToast();
      toast.switch(data!.name);

      setData("loaded", true);
    }

    return data;
  }

  public async duplicateResume(id: number) {
    const { data, error } = await this._db.queryById(id);

    if (error) {
      // TODO: Use toast to show error message
      console.error("Duplicate error:", error.message);
    } else if (!data) {
      // TODO: Use toast to show error message
      console.error(`Switch error: Resume ${id} not found.`);
    } else {
      const duplicated: DbResumeEmpty = {
        name: data!.name,
        markdown: data!.markdown,
        css: data!.css,
        styles: data!.styles
      };

      const { data: duplicatedData, error: createError } = await this._db.create({
        ...duplicated,
        name: duplicated.name + " Copy"
      });

      if (createError) {
        // TODO: Use toast to show error message
        console.error("Duplicate error:", createError.message);
      } else {
        const toast = useToast();
        toast.duplicate(duplicatedData!.name);
        this._emitChange({ type: "create", resume: duplicatedData! });
      }
    }
  }

  public async exportToJSON() {
    const data = await this.getStorageData();

    const json: StorageJson = {
      version: this._version,
      data
    };

    downloadFile("ohmycv_data.json", JSON.stringify(json));
  }

  /**
   * Check the validity of and import JSON data
   *
   * TODO: handle migration if needed
   *
   * @param content JSON string
   */
  public async importFromJson(content: string) {
    const toast = useToast();

    const json = (() => {
      try {
        return JSON.parse(content);
      } catch (error) {
        return null;
      }
    })();

    const res = IsValid.importedJson(json);

    // Invalid version or format
    if (!res) {
      console.error("Import error: Invalid data.");
      toast.import(false);
      return;
    }

    // Migrate data if needed
    const migrateService = new MigrateService(res.version);
    const { data } = await migrateService.migrate(res.data);

    for (const [_id, resume] of Object.entries(data)) {
      const id = Number(_id);
      const { data, error } = await this._db.queryById(id);

      if (error) {
        console.error("Import error: Storage error.");
        break;
      }

      if (data) {
        await this._db.update({ id, ...resume }, false);
      } else {
        await this._db.create({ id, ...resume });
      }
    }

    toast.import(true);
    this._emitChange({ type: "import" });
  }
}

export const storageService = new StorageService("localForage");

export * from "./db";
export { IsValid } from "./utils";
