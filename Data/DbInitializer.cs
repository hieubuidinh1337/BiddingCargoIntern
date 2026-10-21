using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Data;

public static class DbInitializer
{
    public static async Task InitializeAsync(AppDbContext db, ILogger logger)
    {
        if (await db.Database.CanConnectAsync())
        {
            logger.LogInformation("SQL Server database sẵn sàng.");
        }
    }
}
