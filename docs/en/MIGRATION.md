# 📋 Migration Guide: Upgrading from 2.x to 3.x

**Version 3.x is a major release!** The core architecture has been completely refactored, transitioning from Next.js to Vite for bundling, and the backend has been rebuilt with GORM + Gin architecture.

## Upgrade Steps

### 1. Export Master Control Data

- In the 2.x version's master control list, use the export function to save all master control configuration data

### 2. Update Docker Configuration

- Obtain the latest `docker-compose.yml` configuration file from the repository

### 3. Pull the Latest Image

```bash
docker pull ghcr.io/nodepassproject/nodepassdash:latest
```

### 4. Restart Container

```bash
# Run in the directory containing the compose file
docker compose down && docker compose up -d
```

### 5. Re-import Data

- Access the new version interface and recreate master control configurations
- Import the previously exported master control data
- Verify that all functions are working properly

## ⚠️ Important Notes

***This version is not backward compatible. Please backup/export your master control data before upgrading. It is recommended to create a fresh master control setup to avoid issues with legacy data!***

- **Database Incompatibility**: Version 3.x uses a completely new database table structure and cannot directly migrate 2.x data
- **Configuration Format Changes**: Master control configuration format has been adjusted; manual reconfiguration of important tunnels is recommended
- **Feature Changes**: Some function interfaces and operation methods have changed; please refer to the new version documentation

## FAQ

### Q: Can I upgrade directly without losing data?

A: No. Due to the complete database structure refactoring, data must be migrated through the export/import process.

### Q: What does the exported data contain?

A: The exported data includes all master control configuration information, including master control addresses, ports, credentials, and other settings.

### Q: Can I rollback to version 2.x after upgrading?

A: Yes, but you need to use the data backed up before the upgrade. It is recommended to make a complete backup before upgrading.

## Technical Support

If you encounter problems during migration:

- Check [GitHub Issues](https://github.com/NodePassProject/NodePassDash/issues)
- Join [Telegram Group](https://t.me/NodePassGroup) for help
- Follow [Telegram Channel](https://t.me/NodePassChannel) for latest updates
