import { STDatabaseConfiguration } from './STDatabaseConfiguration';
import { STDownloadDatabase } from './download/STDownloadDatabase';
import { STRuleTagDatabase } from './ruletag/STRuleTagDatabase';
import { STStorageDatabase } from './storage/STStorageDatabase';
import { STRuleDnrDatabase } from './rulednr/STRuleDnrDatabase';

/** Open：无 user / userscript / code DB；Pro overlay 覆盖本文件。 */
export class STDatabaseFactory{
  public static downloadDatabase(): STDownloadDatabase {
    return new STDownloadDatabase(STDatabaseConfiguration.downloadConfiguration());
  }

  public static ruleTagDatabase(): STRuleTagDatabase {
    return new STRuleTagDatabase(STDatabaseConfiguration.ruleTagConfiguration());
  }

  public static storageDatabase(): STStorageDatabase {
    return new STStorageDatabase(STDatabaseConfiguration.storageConfiguration());
  }

  public static ruleDnrDatabase(): STRuleDnrDatabase {
    return new STRuleDnrDatabase(STDatabaseConfiguration.ruleDnrConfiguration());
  }
}
