using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Data;

public static class DbInitializer
{
    /// <summary>Tạo database và các bảng nếu chưa có. Không nạp bất kỳ dữ liệu mẫu nào.</summary>
    public static async Task InitializeAsync(AppDbContext db, ILogger logger)
    {
        await db.Database.EnsureCreatedAsync();
        logger.LogInformation("SQL Server database sẵn sàng.");
    }
}
