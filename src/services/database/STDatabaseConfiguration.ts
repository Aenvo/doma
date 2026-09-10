export class STDatabaseConfiguration{
    public name?: string;
    public version: number = 1;
    public isUpgrade: boolean = false;

    private static g_userConfiguration: STDatabaseConfiguration;
    private static g_userscriptConfiguration: STDatabaseConfiguration;
    private static g_codeConfiguration: STDatabaseConfiguration;
    private static g_browserConfiguration: STDatabaseConfiguration;
    private static g_tabConfiguration: STDatabaseConfiguration;
    private static g_downloadConfiguration: STDatabaseConfiguration;
    private static g_homeConfiguration: STDatabaseConfiguration;
    private static g_settingConfiguration: STDatabaseConfiguration;
    private static g_filterConfiguration: STDatabaseConfiguration;
    private static g_ruleFixedConfiguration: STDatabaseConfiguration;
    private static g_ruleTagConfiguration: STDatabaseConfiguration;
    private static g_storageConfiguration: STDatabaseConfiguration;
    private static g_ruleDnrConfiguration: STDatabaseConfiguration;
    private static g_dbSuffix: string = "_prod";

    constructor() {

    }

    public static userscriptConfiguration(): STDatabaseConfiguration {
        if (null == STDatabaseConfiguration.g_userscriptConfiguration) {
          STDatabaseConfiguration.g_userscriptConfiguration = new STDatabaseConfiguration();
          STDatabaseConfiguration.g_userscriptConfiguration.name = `userscript${STDatabaseConfiguration.g_dbSuffix}.db`;
        }
        return STDatabaseConfiguration.g_userscriptConfiguration;
      }
    
      public static settingConfiguration(): STDatabaseConfiguration {
        if (null == STDatabaseConfiguration.g_settingConfiguration) {
          STDatabaseConfiguration.g_settingConfiguration = new STDatabaseConfiguration();
          STDatabaseConfiguration.g_settingConfiguration.name = `setting${STDatabaseConfiguration.g_dbSuffix}.db`;
        }
        return STDatabaseConfiguration.g_settingConfiguration;
      }
    
      public static homeConfiguration(): STDatabaseConfiguration {
        if (null == STDatabaseConfiguration.g_homeConfiguration) {
          STDatabaseConfiguration.g_homeConfiguration = new STDatabaseConfiguration();
          STDatabaseConfiguration.g_homeConfiguration.name = `home${STDatabaseConfiguration.g_dbSuffix}.db`;
        }
        return STDatabaseConfiguration.g_homeConfiguration;
      }
    
      public static browserConfiguration(): STDatabaseConfiguration {
        if (null == STDatabaseConfiguration.g_browserConfiguration) {
          STDatabaseConfiguration.g_browserConfiguration = new STDatabaseConfiguration();
          STDatabaseConfiguration.g_browserConfiguration.name = `browser${STDatabaseConfiguration.g_dbSuffix}.db`;
        }
        return STDatabaseConfiguration.g_browserConfiguration;
      }
    
      public static codeConfiguration(): STDatabaseConfiguration {
        if (null == STDatabaseConfiguration.g_codeConfiguration) {
          STDatabaseConfiguration.g_codeConfiguration = new STDatabaseConfiguration();
          STDatabaseConfiguration.g_codeConfiguration.name = `code${STDatabaseConfiguration.g_dbSuffix}.db`;
        }
        return STDatabaseConfiguration.g_codeConfiguration;
      }
    
      public static downloadConfiguration(): STDatabaseConfiguration {
        if (null == STDatabaseConfiguration.g_downloadConfiguration) {
          STDatabaseConfiguration.g_downloadConfiguration = new STDatabaseConfiguration();
          STDatabaseConfiguration.g_downloadConfiguration.name = `download${STDatabaseConfiguration.g_dbSuffix}.db`;
        }
        return STDatabaseConfiguration.g_downloadConfiguration;
      }
    
      public static filterConfiguration(): STDatabaseConfiguration {
        if (null == STDatabaseConfiguration.g_filterConfiguration) {
          STDatabaseConfiguration.g_filterConfiguration = new STDatabaseConfiguration();
          STDatabaseConfiguration.g_filterConfiguration.name = `filter${STDatabaseConfiguration.g_dbSuffix}.db`;
        }
        return STDatabaseConfiguration.g_filterConfiguration;
      }
    
      public static ruleFixedConfiguration(): STDatabaseConfiguration {
        if (null == STDatabaseConfiguration.g_ruleFixedConfiguration) {
          STDatabaseConfiguration.g_ruleFixedConfiguration = new STDatabaseConfiguration();
          STDatabaseConfiguration.g_ruleFixedConfiguration.name = `rule_fixed${STDatabaseConfiguration.g_dbSuffix}.db`;
        }
        return STDatabaseConfiguration.g_ruleFixedConfiguration;
      }
    
      public static ruleTagConfiguration(): STDatabaseConfiguration {
        if (null == STDatabaseConfiguration.g_ruleTagConfiguration) {
          STDatabaseConfiguration.g_ruleTagConfiguration = new STDatabaseConfiguration();
          STDatabaseConfiguration.g_ruleTagConfiguration.name = `rule_tag${STDatabaseConfiguration.g_dbSuffix}.db`;
        }
        return STDatabaseConfiguration.g_ruleTagConfiguration;
      }
    
      public static tabConfiguration(): STDatabaseConfiguration {
        if (null == STDatabaseConfiguration.g_tabConfiguration) {
          STDatabaseConfiguration.g_tabConfiguration = new STDatabaseConfiguration();
          STDatabaseConfiguration.g_tabConfiguration.name = `tab${STDatabaseConfiguration.g_dbSuffix}.db`;
        }
        return STDatabaseConfiguration.g_tabConfiguration;
      }
    
      public static userConfiguration(): STDatabaseConfiguration {
        if (null == STDatabaseConfiguration.g_userConfiguration) {
          STDatabaseConfiguration.g_userConfiguration = new STDatabaseConfiguration();
          STDatabaseConfiguration.g_userConfiguration.name = `user${STDatabaseConfiguration.g_dbSuffix}.db`;
        }
        return STDatabaseConfiguration.g_userConfiguration;
      }

      public static storageConfiguration(): STDatabaseConfiguration {
        if (null == STDatabaseConfiguration.g_storageConfiguration) {
          STDatabaseConfiguration.g_storageConfiguration = new STDatabaseConfiguration();
          STDatabaseConfiguration.g_storageConfiguration.name = `storage${STDatabaseConfiguration.g_dbSuffix}.db`;
        }
        return STDatabaseConfiguration.g_storageConfiguration;
      }

      public static ruleDnrConfiguration(): STDatabaseConfiguration {
        if (null == STDatabaseConfiguration.g_ruleDnrConfiguration) {
          STDatabaseConfiguration.g_ruleDnrConfiguration = new STDatabaseConfiguration();
          STDatabaseConfiguration.g_ruleDnrConfiguration.name = `rule_dnr${STDatabaseConfiguration.g_dbSuffix}.db`;
        }
        return STDatabaseConfiguration.g_ruleDnrConfiguration;
      }
}