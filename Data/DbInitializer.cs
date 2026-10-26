using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;

namespace BiddingCargo.Web.Data;

public static class DbInitializer
{
    public static bool DetectBoolAsInt(string? connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString)) return true;
        try
        {
            var b = new SqlConnectionStringBuilder(connectionString) { ConnectTimeout = 3 };
            using var conn = new SqlConnection(b.ConnectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandTimeout = 3;
            cmd.CommandText = "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='notifications' AND COLUMN_NAME='read'";
            var t = cmd.ExecuteScalar() as string;
            return !string.Equals(t, "bit", StringComparison.OrdinalIgnoreCase);
        }
        catch { return true; }
    }

    public static async Task InitializeAsync(AppDbContext db, ILogger logger)
    {
        try
        {
            if (await db.Database.CanConnectAsync())
            {
                logger.LogInformation("SQL Server database kết nối thành công và sẵn sàng.");
            }
        }
        catch (Exception e)
        {
            logger.LogWarning(e, "Kiểm tra kết nối SQL Server lúc khởi động gặp cảnh báo.");
        }
    }
}
