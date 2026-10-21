using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BiddingCargo.Web.Data;

// Bảng "users"
public class AppUser
{
    [Key] public string Id { get; set; } = "";
    public string? Username { get; set; }
    public string? AgentCode { get; set; }
    public string? Password { get; set; }
    public string? Pin { get; set; }
    public string? Role { get; set; }
    public string? FullName { get; set; }
    public string? Email { get; set; }
    public string? CompanyName { get; set; }
    public string? Status { get; set; } = "ACTIVE";
}
