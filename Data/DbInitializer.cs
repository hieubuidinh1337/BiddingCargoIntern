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
            var creator = db.GetService<IRelationalDatabaseCreator>();
            if (!await creator.ExistsAsync())
            {
                logger.LogWarning("Chưa có database -> tự tạo mới.");
                await creator.CreateAsync();
            }
            if (!await creator.HasTablesAsync())
            {
                logger.LogWarning("Database chưa có bảng -> tự tạo các bảng.");
                await creator.CreateTablesAsync();
            }
            logger.LogInformation("SQL Server database kết nối thành công và sẵn sàng.");
        }
        catch (Exception e)
        {
            logger.LogError(e, "Không thể kết nối/khởi tạo SQL Server. Kiểm tra ConnectionStrings:DefaultConnection.");
        }
    }
}
