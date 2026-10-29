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
            // Tự động kiểm tra và khởi tạo tài khoản admin mặc định nếu chưa có
            if (!await db.Users.AnyAsync(u => u.Username == "admin"))
            {
                db.Users.Add(new AppUser
                {
                    Id = "USR-001",
                    Username = "admin",
                    Password = "admin2026",
                    FullName = "Trần Quản Trị (Super Admin)",
                    Email = "admin@vietravelairlines.vn",
                    Role = "ADMIN",
                    Status = "ACTIVE"
                });
                await db.SaveChangesAsync();
                logger.LogInformation("Đã khởi tạo tài khoản quản trị mặc định (admin) trong bảng users.");
            }

            var adminSetting = await db.Settings.FirstOrDefaultAsync(s => s.Key == "adminsList");
            if (adminSetting == null || string.IsNullOrWhiteSpace(adminSetting.Value) || adminSetting.Value.Trim() == "[]")
            {
                var defaultAdminsJson = "[{\"id\":99,\"username\":\"admin\",\"password\":\"admin2026\",\"role\":\"SUPER_ADMIN\",\"roles\":[\"SUPER_ADMIN\"],\"fullName\":\"Tr\u1EA7n Qu\u1EA3n Tr\u1ECB (Super Admin)\",\"email\":\"admin@vietravelairlines.vn\",\"department\":\"\"}]";
                if (adminSetting == null)
                {
                    db.Settings.Add(new Setting { Key = "adminsList", Value = defaultAdminsJson });
                }
                else
                {
                    adminSetting.Value = defaultAdminsJson;
                }
                await db.SaveChangesAsync();
                logger.LogInformation("Đã khởi tạo danh sách quản trị mặc định trong bảng settings (adminsList).");
            }

            var airportsSetting = await db.Settings.FirstOrDefaultAsync(s => s.Key == "airports");
            if (airportsSetting == null || string.IsNullOrWhiteSpace(airportsSetting.Value) || airportsSetting.Value.Trim() == "[]")
            {
                var defaultAirportsJson = "[{\"code\":\"DAD\",\"name\":\"Da Nang International Airport\"},{\"code\":\"DLI\",\"name\":\"Lien Khuong Airport\"},{\"code\":\"HAN\",\"name\":\"Noi Bai International Airport\"},{\"code\":\"HPH\",\"name\":\"Cat Bi International Airport\"},{\"code\":\"HUI\",\"name\":\"Phu Bai International Airport\"},{\"code\":\"SGN\",\"name\":\"Tan Son Nhat International Airport\"},{\"code\":\"UIH\",\"name\":\"Phu Cat Airport\"},{\"code\":\"PQC\",\"name\":\"Phu Quoc International Airport\"},{\"code\":\"VCA\",\"name\":\"Can Tho International Airport\"},{\"code\":\"CXR\",\"name\":\"Cam Ranh International Airport\"},{\"code\":\"VII\",\"name\":\"Vinh International Airport\"},{\"code\":\"VDO\",\"name\":\"Van Don International Airport\"}]";
                if (airportsSetting == null)
                    db.Settings.Add(new Setting { Key = "airports", Value = defaultAirportsJson });
                else
                    airportsSetting.Value = defaultAirportsJson;
                await db.SaveChangesAsync();
                logger.LogInformation("Đã khởi tạo danh mục sân bay mặc định trong bảng settings (airports).");
            }

            var aircraftTypesSetting = await db.Settings.FirstOrDefaultAsync(s => s.Key == "aircraftTypes");
            if (aircraftTypesSetting == null || string.IsNullOrWhiteSpace(aircraftTypesSetting.Value) || aircraftTypesSetting.Value.Trim() == "[]")
            {
                var defaultAircraftTypesJson = "[{\"code\":\"32V\",\"name\":\"A320\"},{\"code\":\"32I\",\"name\":\"A321\"},{\"code\":\"32E\",\"name\":\"A321\"},{\"code\":\"32S\",\"name\":\"A320\"},{\"code\":\"32O\",\"name\":\"A320\"},{\"code\":\"32Q\",\"name\":\"A320\"},{\"code\":\"32Y\",\"name\":\"A320\"},{\"code\":\"32L\",\"name\":\"A320\"},{\"code\":\"32B\",\"name\":\"A321\"},{\"code\":\"320\",\"name\":\"A320\"},{\"code\":\"321\",\"name\":\"A321\"}]";
                if (aircraftTypesSetting == null)
                    db.Settings.Add(new Setting { Key = "aircraftTypes", Value = defaultAircraftTypesJson });
                else
                    aircraftTypesSetting.Value = defaultAircraftTypesJson;
                await db.SaveChangesAsync();
                logger.LogInformation("Đã khởi tạo danh mục loại tàu bay mặc định trong bảng settings (aircraftTypes).");
            }

            await DeduplicateExistingLogsAsync(db, logger);
            logger.LogInformation("SQL Server database kết nối thành công và sẵn sàng.");
        }
        catch (Exception e)
        {
            logger.LogError(e, "Không thể kết nối/khởi tạo SQL Server. Kiểm tra ConnectionStrings:DefaultConnection.");
        }
    }

    public static async Task DeduplicateExistingLogsAsync(AppDbContext db, ILogger logger)
    {
        try
        {
            var all = await db.ActivityLogs.OrderByDescending(l => l.RawTime).ToListAsync();
            var toRemove = new List<ActivityLog>();
            var kept = new List<ActivityLog>();

            foreach (var log in all)
            {
                var isDup = kept.Any(k =>
                    Math.Abs(k.RawTime - log.RawTime) <= 30000 &&
                    Services.LogService.IsSemanticDuplicate(k, log));

                if (isDup)
                {
                    toRemove.Add(log);
                }
                else
                {
                    kept.Add(log);
                }
            }

            if (toRemove.Count > 0)
            {
                db.ActivityLogs.RemoveRange(toRemove);
                await db.SaveChangesAsync();
                logger.LogInformation("Đã dọn dẹp {Count} bản ghi nhật ký trùng lặp trong CSDL.", toRemove.Count);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Lỗi khi dọn dẹp nhật ký trùng lặp trong CSDL.");
        }
    }
}
