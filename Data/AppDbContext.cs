using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Agent> Agents => Set<Agent>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Auction> Auctions => Set<Auction>();
    public DbSet<Bid> Bids => Set<Bid>();
    public DbSet<WonAuction> WonAuctions => Set<WonAuction>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<Registration> Registrations => Set<Registration>();
    public DbSet<Chat> Chats => Set<Chat>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<EmailLog> EmailLogs => Set<EmailLog>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<ActivityLog> ActivityLogs => Set<ActivityLog>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // Giữ nguyên tên bảng/cột như schema.sql của bản Node.js để dùng lại được file database.sqlite cũ.
        b.Entity<Agent>().ToTable("agents");
        b.Entity<AppUser>().ToTable("users");
        b.Entity<Auction>().ToTable("auctions");
        b.Entity<Bid>().ToTable("bids");
        b.Entity<WonAuction>().ToTable("won_auctions");
        b.Entity<Notification>().ToTable("notifications");
        b.Entity<Registration>().ToTable("registrations");
        b.Entity<Chat>().ToTable("chats");
        b.Entity<ChatMessage>().ToTable("chat_messages");
        b.Entity<EmailLog>().ToTable("email_logs");
        b.Entity<Setting>().ToTable("settings");
        b.Entity<ActivityLog>().ToTable("activity_logs");

        // Cột theo camelCase (code, companyName, taxCode...) trừ những cột đã đặt [Column] tường minh
        foreach (var et in b.Model.GetEntityTypes())
        {
            foreach (var p in et.GetProperties())
            {
                var explicitName = p.PropertyInfo?.GetCustomAttributes(typeof(System.ComponentModel.DataAnnotations.Schema.ColumnAttribute), false).Any() == true;
                if (!explicitName && p.Name.Length > 0)
                    p.SetColumnName(char.ToLowerInvariant(p.Name[0]) + p.Name.Substring(1));
            }
        }

        b.Entity<Bid>().HasIndex(x => x.AuctionId);
        b.Entity<Bid>().HasIndex(x => x.AgentCode);
        b.Entity<WonAuction>().HasIndex(x => x.AgentCode);
        b.Entity<Chat>().HasIndex(x => x.AgentCode);
        b.Entity<ChatMessage>().HasIndex(x => x.ChatId);
        b.Entity<AppUser>().HasIndex(x => x.Username).IsUnique();
    }
}
