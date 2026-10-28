using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using BiddingCargo.Web.Services;
using Microsoft.EntityFrameworkCore;
using static BiddingCargo.Web.Endpoints.ApiEndpoints;

namespace BiddingCargo.Web.Endpoints;

/// <summary>Các API chuyên biệt cho Portal Đại lý: đặt thầu, hoàn tiền, Dashboard, Sàn đấu giá, Hồ sơ và Đơn thắng thầu.</summary>
public static class AgentPortalEndpoints
{
    public static void MapAgentPortalEndpoints(this RouteGroupBuilder api, ILogger log)
    {
        // ---- đặt thầu
        api.MapPost("/bids/place", (HttpContext ctx, BidService bids) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var auctionId = EntityJson.Str(b, "auctionId");
            var agentCode = EntityJson.Str(b, "agentCode");
            var price = EntityJson.Lng(b, "priceKg") ?? 0;
            if (string.IsNullOrEmpty(auctionId) || string.IsNullOrEmpty(agentCode) || price == 0)
                return Err("Thiếu auctionId, agentCode hoặc priceKg");
            var bid = await bids.PlaceAsync(new PlaceBidRequest(auctionId, agentCode, EntityJson.Str(b, "agentName"), price,
                EntityJson.Bool(b, "isAnonymous") ?? true, EntityJson.Lng(b, "weightKg") ?? 0, EntityJson.Str(b, "bidId")));
            return J(new JsonObject
            {
                ["success"] = true, ["bid"] = EntityJson.ToNode(bid),
                ["message"] = $"Đặt thầu thành công mức giá {Util.FmtVi(price)}đ / Kg!"
            });
        }, log));

        // ---- hoàn tiền
        api.MapPost("/wonauction/refund-info", (HttpContext ctx, WonAuctionService svc) => Guard(async () =>
        {
            var w = await svc.SubmitRefundInfoAsync(await BodyAsync(ctx.Request), ctx.Connection.RemoteIpAddress?.ToString());
            return J(new JsonObject { ["success"] = true, ["message"] = "Đã ghi nhận thông tin tài khoản nhận tiền hoàn thành công.", ["wonItem"] = EntityJson.ToNode(w) });
        }, log));

        api.MapPost("/wonauction/confirm-refund", (HttpContext ctx, WonAuctionService svc) => Guard(async () =>
        {
            var w = await svc.ConfirmRefundAsync(await BodyAsync(ctx.Request), ctx.Connection.RemoteIpAddress?.ToString());
            return J(new JsonObject
            {
                ["success"] = true, ["wonItem"] = EntityJson.ToNode(w),
                ["message"] = $"Đã xác nhận hoàn tiền cho đơn hàng {w.WonId}. Hệ thống đã gửi thông báo đến đại lý {w.AgentCode}."
            });
        }, log));

        api.MapPost("/wonauction/payment-transfer", (HttpContext ctx, SettlementPaymentService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            return J(await svc.SubmitPaymentTransferAsync(EntityJson.Str(b, "wonId"), b, ctx.Connection.RemoteIpAddress?.ToString()));
        }, log));

        api.MapPost("/wonauction/cargo-declaration", (HttpContext ctx, SettlementPaymentService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var cargo = (b["cargoDeclaration"] as JsonObject) ?? b;
            return J(await svc.UpdateCargoDeclarationAsync(EntityJson.Str(b, "wonId"), cargo, ctx.Connection.RemoteIpAddress?.ToString()));
        }, log));

        api.MapPost("/agent/routes/subscribe", (HttpContext ctx, BankRouteService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var settings = (b["settings"] as JsonObject) ?? b;
            return J(await svc.SaveRouteSubscriptionsAsync(EntityJson.Str(b, "agentCode") ?? ctx.Request.Cookies["cargo_agent_code"], settings));
        }, log));

        // ---- kiểm tra trạng thái khóa tài khoản
        api.MapGet("/agent/status", async (HttpContext ctx, AppDbContext db) =>
        {
            var qCode = ctx.Request.Query["code"].ToString();
            if (string.IsNullOrEmpty(qCode)) qCode = ctx.Request.Query["agentCode"].ToString();
            var code = (!string.IsNullOrEmpty(qCode) ? qCode : ctx.Request.Cookies["cargo_agent_code"] ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(code))
                return J(new JsonObject { ["success"] = false, ["isLocked"] = false });

            var agent = await db.Agents.AsNoTracking().FirstOrDefaultAsync(a => a.Code.ToUpper() == code);
            if (agent == null)
                return J(new JsonObject { ["success"] = false, ["notFound"] = true, ["isLocked"] = false });

            var isLocked = agent.IsLocked || agent.Status == "Đã khóa" || agent.Status == "LOCKED";
            if (isLocked)
            {
                ctx.Response.Cookies.Delete("cargo_agent_code");
            }
            return J(new JsonObject
            {
                ["success"] = true,
                ["code"] = agent.Code,
                ["isLocked"] = isLocked,
                ["status"] = agent.Status ?? "Đang hoạt động",
                ["reason"] = isLocked ? (agent.LockedReason ?? "Tài khoản đại lý của bạn đã bị KHÓA bởi Quản trị viên.") : null
            });
        });

        // ---- Agent Dashboard
        api.MapGet("/agent/dashboard", async (HttpContext ctx, AppDbContext db) =>
        {
            var qCode = ctx.Request.Query["agentCode"].ToString();
            if (string.IsNullOrEmpty(qCode)) qCode = ctx.Request.Query["code"].ToString();
            var explicitCode = (!string.IsNullOrEmpty(qCode) ? qCode : ctx.Request.Cookies["cargo_agent_code"])?.Trim().ToUpperInvariant();
            var fromDate = ctx.Request.Query["fromDate"].ToString();
            var toDate = ctx.Request.Query["toDate"].ToString();

            Agent? agent = ctx.Items["CurrentAgent"] as Agent;
            if (!string.IsNullOrEmpty(explicitCode))
            {
                if (agent == null || !string.Equals(agent.Code, explicitCode, StringComparison.OrdinalIgnoreCase))
                {
                    agent = await db.Agents.AsNoTracking().FirstOrDefaultAsync(a => a.Code.ToUpper() == explicitCode);
                }
                if (agent != null && (agent.IsLocked || agent.Status == "Đã khóa" || agent.Status == "LOCKED"))
                {
                    ctx.Response.Cookies.Delete("cargo_agent_code");
                    return J(new JsonObject
                    {
                        ["success"] = false,
                        ["isLocked"] = true,
                        ["agentCode"] = agent.Code,
                        ["message"] = agent.LockedReason ?? "Tài khoản đại lý của bạn đã bị KHÓA bởi Quản trị viên."
                    }, 403);
                }
            }

            if (agent == null)
            {
                agent = await db.Agents.AsNoTracking().Where(a => !a.IsLocked && a.Status != "Đã khóa" && a.Status != "LOCKED").OrderBy(a => a.Code).FirstOrDefaultAsync();
            }
            var agentCode = agent?.Code ?? explicitCode ?? "";

            var unreadCount = 0;
            if (agent != null)
            {
                unreadCount = await db.Notifications.CountAsync(n => !n.Read &&
                    (n.TargetAgentCode == agent.Code || (n.TargetAgentCode == null && (n.TargetRole == null || n.TargetRole == "AGENT" || n.TargetRole == "agent"))));
            }

            var allAuctions = await db.Auctions.AsNoTracking().ToListAsync();
            var nowMs = Util.NowMs();

            var openList = allAuctions.Where(a =>
            {
                var isEffectiveOpen = a.Status == "OPEN";
                if (!isEffectiveOpen && a.Status == "UPCOMING")
                {
                    var openMs = Util.ParseIso(a.OpenDateIso)?.ToUnixTimeMilliseconds()
                        ?? (Util.ParseFlightDate(a.OpenDate) != null ? new DateTimeOffset(Util.ParseFlightDate(a.OpenDate)!.Value).ToUnixTimeMilliseconds() : (long?)null);
                    if (openMs == null || openMs.Value <= nowMs) isEffectiveOpen = true;
                }
                if (!isEffectiveOpen) return false;

                var endMs = Util.ParseIso(a.EndTime)?.ToUnixTimeMilliseconds()
                    ?? (Util.ParseFlightDate(a.CloseDate) != null ? new DateTimeOffset(Util.ParseFlightDate(a.CloseDate)!.Value).ToUnixTimeMilliseconds() : (long?)null);
                if (endMs.HasValue && endMs.Value <= nowMs) return false;
                if (!string.IsNullOrEmpty(a.AllowedAgentsJson) && !string.IsNullOrEmpty(agentCode))
                {
                    try
                    {
                        var allowed = System.Text.Json.JsonSerializer.Deserialize<List<string>>(a.AllowedAgentsJson);
                        if (allowed != null && allowed.Count > 0 && !allowed.Contains("ALL", StringComparer.OrdinalIgnoreCase) && !allowed.Contains(agentCode, StringComparer.OrdinalIgnoreCase))
                            return false;
                    } catch { }
                }
                return true;
            }).ToList();

            if (!string.IsNullOrEmpty(fromDate))
            {
                openList = openList.Where(a =>
                {
                    var fStart = a.FlightStartDate ?? (a.EtdIso != null && a.EtdIso.Length >= 10 ? a.EtdIso.Substring(0, 10) : "");
                    var fEnd = a.FlightEndDate ?? fStart;
                    return string.IsNullOrEmpty(fEnd) || string.Compare(fEnd, fromDate, StringComparison.Ordinal) >= 0;
                }).ToList();
            }
            if (!string.IsNullOrEmpty(toDate))
            {
                openList = openList.Where(a =>
                {
                    var fStart = a.FlightStartDate ?? (a.EtdIso != null && a.EtdIso.Length >= 10 ? a.EtdIso.Substring(0, 10) : "");
                    return string.IsNullOrEmpty(fStart) || string.Compare(fStart, toDate, StringComparison.Ordinal) <= 0;
                }).ToList();
            }

            var agentBids = new List<Bid>();
            if (!string.IsNullOrEmpty(agentCode))
            {
                agentBids = await db.Bids.AsNoTracking().Where(b => b.AgentCode != null && b.AgentCode.ToUpper() == agentCode).ToListAsync();
            }
            var bidsByAuction = agentBids.GroupBy(b => b.AuctionId).ToDictionary(g => g.Key, g => g.OrderByDescending(b => b.PriceKg).First());

            var auctionDtos = openList.Select(a =>
            {
                bidsByAuction.TryGetValue(a.Id, out var myBid);
                var isSubmitted = myBid != null;
                var capKg = a.CapacityKg > 0 ? a.CapacityKg : 3500;
                var startPrice = a.StartingPriceKg > 0 ? a.StartingPriceKg : 18000;
                var curPrice = isSubmitted ? myBid!.PriceKg : startPrice;
                return new JsonObject
                {
                    ["id"] = a.Id,
                    ["flightCode"] = a.FlightCode ?? $"VU-{a.Id}",
                    ["flightNumber"] = a.FlightNumber ?? "VU-000",
                    ["route"] = a.Route ?? $"{a.Origin}-{a.Destination}",
                    ["origin"] = a.Origin ?? "SGN",
                    ["destination"] = a.Destination ?? "HAN",
                    ["originName"] = a.OriginName ?? a.Origin ?? "TP. Hồ Chí Minh",
                    ["destName"] = a.DestName ?? a.Destination ?? "Hà Nội",
                    ["flightPeriod"] = a.FlightPeriod,
                    ["etd"] = a.Etd ?? "08:00",
                    ["eta"] = a.Eta ?? "10:15",
                    ["endTime"] = a.EndTime ?? a.CloseDateIso ?? DateTime.UtcNow.AddHours(2).ToString("o"),
                    ["capacityKg"] = capKg,
                    ["startingPriceKg"] = startPrice,
                    ["currentPriceKg"] = a.CurrentPriceKg,
                    ["minStep"] = a.MinStep > 0 ? a.MinStep : 500,
                    ["status"] = a.Status ?? "OPEN",
                    ["isSubmitted"] = isSubmitted,
                    ["myHighestBidPriceKg"] = myBid?.PriceKg,
                    ["totalAmountVnd"] = capKg * curPrice
                };
            }).OrderByDescending(x => EntityJson.Lng(x, "id")).ToList();

            var openIds = openList.Select(a => a.Id).ToHashSet();
            var participatingCount = bidsByAuction.Keys.Count(id => openIds.Contains(id));
            var wonCount = 0;
            if (!string.IsNullOrEmpty(agentCode))
            {
                wonCount = await db.WonAuctions.CountAsync(w => w.AgentCode != null && w.AgentCode.ToUpper() == agentCode);
            }

            var auctionsArr = new JsonArray();
            foreach (var a in auctionDtos) auctionsArr.Add(a);

            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject
            {
                ["success"] = true,
                ["agent"] = new JsonObject
                {
                    ["code"] = agent?.Code ?? "AG-0001",
                    ["name"] = agent?.Name ?? agent?.CompanyName ?? "Đại lý",
                    ["companyName"] = agent?.CompanyName ?? agent?.Name ?? "Đại lý",
                    ["email"] = agent?.Email ?? "",
                    ["phone"] = agent?.Phone ?? "",
                    ["tier"] = "TIER1",
                    ["hasPin"] = !string.IsNullOrEmpty(agent?.Pin),
                    ["unreadNotifCount"] = unreadCount
                },
                ["kpis"] = new JsonObject
                {
                    ["openAuctionsCount"] = auctionDtos.Count,
                    ["participatingCount"] = participatingCount,
                    ["wonAuctionsCount"] = wonCount
                },
                ["auctions"] = auctionsArr
            });
        });

        // ---- Agent Auctions List
        api.MapGet("/agent/auctions", async (HttpContext ctx, AppDbContext db, SharedDataService shared) =>
        {
            var qCode = ctx.Request.Query["agentCode"].ToString();
            if (string.IsNullOrEmpty(qCode)) qCode = ctx.Request.Query["code"].ToString();
            var explicitCode = (!string.IsNullOrEmpty(qCode) ? qCode : ctx.Request.Cookies["cargo_agent_code"])?.Trim().ToUpperInvariant();

            if (!string.IsNullOrEmpty(explicitCode))
            {
                var agCheck = ctx.Items["CurrentAgent"] as Agent;
                if (agCheck == null || !string.Equals(agCheck.Code, explicitCode, StringComparison.OrdinalIgnoreCase))
                {
                    agCheck = await db.Agents.AsNoTracking().FirstOrDefaultAsync(a => a.Code.ToUpper() == explicitCode);
                }
                if (agCheck != null && (agCheck.IsLocked || agCheck.Status == "Đã khóa" || agCheck.Status == "LOCKED"))
                {
                    ctx.Response.Cookies.Delete("cargo_agent_code");
                    return J(new JsonObject
                    {
                        ["success"] = false,
                        ["isLocked"] = true,
                        ["agentCode"] = agCheck.Code,
                        ["message"] = agCheck.LockedReason ?? "Tài khoản đại lý của bạn đã bị KHÓA bởi Quản trị viên."
                    }, 403);
                }
            }

            var agentCode = explicitCode ?? "";
            var route = ctx.Request.Query["route"].ToString();
            var status = ctx.Request.Query["status"].ToString();
            var sort = ctx.Request.Query["sort"].ToString();
            var q = ctx.Request.Query["q"].ToString();
            int.TryParse(ctx.Request.Query["page"], out var page);
            if (page < 1) page = 1;
            int.TryParse(ctx.Request.Query["pageSize"], out var pageSize);
            if (pageSize < 1) pageSize = 12;

            try { await shared.MaintenanceAsync(); } catch { }

            var selectedRoute = string.IsNullOrWhiteSpace(route) ? "ALL" : route.Trim().ToUpperInvariant();
            var selectedStatus = string.IsNullOrWhiteSpace(status) ? "ALL" : status.Trim().ToUpperInvariant();
            var selectedSort = string.IsNullOrWhiteSpace(sort) ? "CLOSING_SOON" : sort.Trim();
            var searchQuery = q?.Trim() ?? "";

            var allAuctions = await db.Auctions.AsNoTracking().ToListAsync();

            var routesArr = new JsonArray();
            var distinctRoutes = allAuctions
                .Where(a => !string.IsNullOrEmpty(a.Origin) && !string.IsNullOrEmpty(a.Destination))
                .Select(a => new { Pair = $"{a.Origin!.Trim().ToUpper()}-{a.Destination!.Trim().ToUpper()}", Origin = a.OriginName ?? a.Origin ?? "", Dest = a.DestName ?? a.Destination ?? "" })
                .GroupBy(r => r.Pair)
                .Select(g => g.First())
                .OrderBy(r => r.Pair);
            foreach (var r in distinctRoutes)
            {
                routesArr.Add(new JsonObject { ["pair"] = r.Pair, ["origin"] = r.Origin, ["dest"] = r.Dest });
            }

            var filtered = allAuctions.Where(a =>
            {
                if (!string.IsNullOrEmpty(a.AllowedAgentsJson) && !string.IsNullOrEmpty(agentCode))
                {
                    try
                    {
                        var allowed = System.Text.Json.JsonSerializer.Deserialize<List<string>>(a.AllowedAgentsJson);
                        if (allowed != null && allowed.Count > 0 && !allowed.Contains("ALL", StringComparer.OrdinalIgnoreCase) && !allowed.Contains(agentCode, StringComparer.OrdinalIgnoreCase))
                            return false;
                    } catch { }
                }
                if (selectedRoute != "ALL")
                {
                    var cleanRoute = (a.Route ?? $"{a.Origin}-{a.Destination}").Replace(" ", "").ToUpperInvariant();
                    var cleanTarget = selectedRoute.Replace(" ", "").ToUpperInvariant();
                    if (cleanRoute != cleanTarget) return false;
                }
                if (selectedStatus != "ALL")
                {
                    if (string.Compare(a.Status, selectedStatus, StringComparison.OrdinalIgnoreCase) != 0) return false;
                }
                if (!string.IsNullOrEmpty(searchQuery))
                {
                    var qLower = searchQuery.ToLowerInvariant();
                    var match = (a.FlightNumber?.ToLowerInvariant().Contains(qLower) ?? false) ||
                                (a.FlightCode?.ToLowerInvariant().Contains(qLower) ?? false) ||
                                (a.Route?.ToLowerInvariant().Contains(qLower) ?? false) ||
                                (a.Origin?.ToLowerInvariant().Contains(qLower) ?? false) ||
                                (a.Destination?.ToLowerInvariant().Contains(qLower) ?? false);
                    if (!match) return false;
                }
                return true;
            }).ToList();

            var agentBids = new List<Bid>();
            if (!string.IsNullOrEmpty(agentCode))
            {
                agentBids = await db.Bids.AsNoTracking().Where(b => b.AgentCode != null && b.AgentCode.ToUpper() == agentCode).ToListAsync();
            }
            var bidsByAuction = agentBids.GroupBy(b => b.AuctionId).ToDictionary(g => g.Key, g => g.OrderByDescending(b => b.PriceKg).First());

            IEnumerable<Auction> sorted = filtered;
            if (selectedSort == "PRICE_HIGH")
                sorted = sorted.OrderByDescending(a => a.CurrentPriceKg > 0 ? a.CurrentPriceKg : a.StartingPriceKg);
            else if (selectedSort == "CAPACITY_HIGH")
                sorted = sorted.OrderByDescending(a => a.CapacityKg);
            else
                sorted = sorted.OrderBy(a => Util.ParseIso(a.EndTime)?.ToUnixTimeMilliseconds() ?? long.MaxValue);

            var sortedList = sorted.ToList();
            var total = sortedList.Count;
            var totalPages = (int)Math.Ceiling((double)total / pageSize);
            if (totalPages < 1) totalPages = 1;
            var paged = sortedList.Skip((page - 1) * pageSize).Take(pageSize).ToList();

            var auctionsArr = new JsonArray();
            foreach (var a in paged)
            {
                bidsByAuction.TryGetValue(a.Id, out var myBid);
                auctionsArr.Add(new JsonObject
                {
                    ["id"] = a.Id,
                    ["flightCode"] = a.FlightCode ?? $"#{a.Id}",
                    ["flightNumber"] = a.FlightNumber ?? "VU-000",
                    ["route"] = a.Route ?? $"{a.Origin}-{a.Destination}",
                    ["origin"] = a.Origin ?? "SGN",
                    ["destination"] = a.Destination ?? "HAN",
                    ["originName"] = a.OriginName ?? a.Origin ?? "",
                    ["destName"] = a.DestName ?? a.Destination ?? "",
                    ["aircraft"] = a.Aircraft ?? "A321F",
                    ["capacityKg"] = a.CapacityKg > 0 ? a.CapacityKg : 3500,
                    ["startingPriceKg"] = a.StartingPriceKg > 0 ? a.StartingPriceKg : 18000,
                    ["currentPriceKg"] = a.CurrentPriceKg > 0 ? a.CurrentPriceKg : a.StartingPriceKg,
                    ["minStep"] = a.MinStep > 0 ? a.MinStep : 500,
                    ["etd"] = a.Etd ?? "08:00",
                    ["eta"] = a.Eta ?? "10:15",
                    ["cutOffTime"] = a.CutOffTime ?? "18:00",
                    ["warehouse"] = EntityJson.GetExtraString(a, "warehouse") ?? "Kho TCS - Tân Sơn Nhất",
                    ["endTime"] = a.EndTime ?? a.CloseDateIso ?? DateTime.UtcNow.AddHours(2).ToString("o"),
                    ["status"] = a.Status ?? "OPEN",
                    ["bidsCount"] = a.BidsCount,
                    ["leadingAgentDisplay"] = "Đại lý ẩn danh (AG-***)",
                    ["flightPeriod"] = a.FlightPeriod,
                    ["myHighestBidPriceKg"] = myBid?.PriceKg,
                    ["isSubmitted"] = myBid != null
                });
            }

            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject
            {
                ["success"] = true,
                ["total"] = total,
                ["page"] = page,
                ["pageSize"] = pageSize,
                ["totalPages"] = totalPages,
                ["routes"] = routesArr,
                ["auctions"] = auctionsArr
            });
        });

        // ---- Agent Notifications
        api.MapGet("/agent/notifications", async (HttpContext ctx, AppDbContext db) =>
        {
            var agentCode = ctx.Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(agentCode))
            {
                agentCode = ctx.Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant() ?? "";
            }
            var filter = ctx.Request.Query["filter"].ToString().Trim();

            var query = db.Notifications.AsNoTracking().AsQueryable();
            if (!string.IsNullOrEmpty(agentCode))
            {
                query = query.Where(n =>
                    n.TargetAgentCode == null ||
                    n.TargetAgentCode == "" ||
                    n.TargetAgentCode == "ALL" ||
                    n.TargetAgentCode.ToUpper() == agentCode ||
                    n.TargetRole == "AGENT");
            }
            else
            {
                query = query.Where(n => n.TargetAgentCode == null || n.TargetAgentCode == "" || n.TargetAgentCode == "ALL" || n.TargetRole == "AGENT");
            }

            var all = await query.OrderByDescending(n => n.Id).ToListAsync();
            var total = all.Count;
            var unread = all.Count(n => !n.Read);
            var won = all.Count(n => n.Type == "WON");

            var filtered = all;
            if (!string.IsNullOrEmpty(filter) && filter.ToLowerInvariant() == "unread")
            {
                filtered = all.Where(n => !n.Read).ToList();
            }
            else if (!string.IsNullOrEmpty(filter) && filter.ToLowerInvariant() != "all")
            {
                filtered = all.Where(n => string.Equals(n.Type, filter, StringComparison.OrdinalIgnoreCase)).ToList();
            }

            var arr = new JsonArray();
            foreach (var n in filtered)
            {
                arr.Add(new JsonObject
                {
                    ["id"] = n.Id,
                    ["title"] = n.Title ?? "",
                    ["message"] = n.Message ?? "",
                    ["type"] = n.Type ?? "INFO",
                    ["time"] = n.Time ?? "",
                    ["read"] = n.Read,
                    ["targetAgentCode"] = n.TargetAgentCode,
                    ["targetRole"] = n.TargetRole,
                    ["link"] = n.Link
                });
            }

            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject
            {
                ["success"] = true,
                ["total"] = total,
                ["unread"] = unread,
                ["won"] = won,
                ["notifications"] = arr
            });
        });

        // ---- Agent Auction Detail
        api.MapGet("/agent/auction/{id:int}", async (int id, HttpContext ctx, AppDbContext db) =>
        {
            var agentCode = ctx.Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(agentCode))
            {
                agentCode = ctx.Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant() ?? "";
            }

            var auction = await db.Auctions.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id);
            if (auction == null) return Err("Không tìm thấy phiên đấu giá", 404);

            var bids = await db.Bids.AsNoTracking()
                .Where(b => b.AuctionId == id)
                .OrderByDescending(b => b.PriceKg)
                .ToListAsync();

            var bidsArr = new JsonArray();
            foreach (var b in bids)
            {
                var isMe = !string.IsNullOrEmpty(agentCode) && string.Equals(b.AgentCode, agentCode, StringComparison.OrdinalIgnoreCase);
                bidsArr.Add(new JsonObject
                {
                    ["id"] = b.Id,
                    ["priceKg"] = b.PriceKg,
                    ["weightKg"] = b.WeightKg,
                    ["time"] = b.Time ?? "",
                    ["timestamp"] = b.Timestamp,
                    ["status"] = b.Status ?? "RECEIVED",
                    ["isMe"] = isMe,
                    ["agentCode"] = isMe ? b.AgentCode : "AG-***",
                    ["agentName"] = isMe ? (b.AgentName ?? b.AgentCode) : "Đại lý ẩn danh (AG-***)"
                });
            }

            var myHighestBid = bids.FirstOrDefault(b => !string.IsNullOrEmpty(agentCode) && string.Equals(b.AgentCode, agentCode, StringComparison.OrdinalIgnoreCase));

            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject
            {
                ["success"] = true,
                ["auction"] = new JsonObject
                {
                    ["id"] = auction.Id,
                    ["flightCode"] = auction.FlightCode ?? $"#{auction.Id}",
                    ["flightNumber"] = auction.FlightNumber ?? "VU-000",
                    ["route"] = auction.Route ?? $"{auction.Origin}-{auction.Destination}",
                    ["origin"] = auction.Origin ?? "SGN",
                    ["destination"] = auction.Destination ?? "HAN",
                    ["originName"] = auction.OriginName ?? "",
                    ["destName"] = auction.DestName ?? "",
                    ["aircraft"] = auction.Aircraft ?? "A321F",
                    ["capacityKg"] = auction.CapacityKg > 0 ? auction.CapacityKg : 3500,
                    ["startingPriceKg"] = auction.StartingPriceKg > 0 ? auction.StartingPriceKg : 18000,
                    ["currentPriceKg"] = auction.CurrentPriceKg > 0 ? auction.CurrentPriceKg : auction.StartingPriceKg,
                    ["minStep"] = auction.MinStep > 0 ? auction.MinStep : 500,
                    ["etd"] = auction.Etd ?? "08:00",
                    ["eta"] = auction.Eta ?? "10:15",
                    ["cutOffTime"] = auction.CutOffTime ?? "18:00",
                    ["warehouse"] = EntityJson.GetExtraString(auction, "warehouse") ?? "Kho TCS - Tân Sơn Nhất",
                    ["endTime"] = auction.EndTime ?? auction.CloseDateIso ?? DateTime.UtcNow.AddHours(2).ToString("o"),
                    ["status"] = auction.Status ?? "OPEN",
                    ["bidsCount"] = auction.BidsCount,
                    ["specialNotes"] = auction.SpecialNotes,
                    ["flightPeriod"] = auction.FlightPeriod,
                    ["allowedAgentsJson"] = auction.AllowedAgentsJson,
                    ["myHighestBidPriceKg"] = myHighestBid?.PriceKg,
                    ["isSubmitted"] = myHighestBid != null
                },
                ["bids"] = bidsArr
            });
        });

        // ---- Agent My Bids
        api.MapGet("/agent/my-bids", async (HttpContext ctx, AppDbContext db) =>
        {
            var agentCode = ctx.Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(agentCode))
            {
                agentCode = ctx.Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant() ?? "";
            }
            if (string.IsNullOrEmpty(agentCode))
            {
                return J(new JsonObject { ["success"] = true, ["bids"] = new JsonArray(), ["total"] = 0 });
            }

            var bids = await db.Bids.AsNoTracking()
                .Where(b => b.AgentCode != null && b.AgentCode.ToUpper() == agentCode)
                .OrderByDescending(b => b.Timestamp)
                .ToListAsync();

            var auctionIds = bids.Select(b => b.AuctionId).Distinct().ToList();
            var auctionList = await db.Auctions.AsNoTracking()
                .Where(a => auctionIds.Contains(a.Id))
                .ToListAsync();
            var auctions = auctionList.GroupBy(a => a.Id).ToDictionary(g => g.Key, g => g.First());

            var wonList = await db.WonAuctions.AsNoTracking()
                .Where(w => w.AgentCode != null && w.AgentCode.ToUpper() == agentCode && w.AuctionId.HasValue)
                .ToListAsync();
            var wons = wonList.GroupBy(w => w.AuctionId!.Value).ToDictionary(g => g.Key, g => g.First());

            var arr = new JsonArray();
            foreach (var b in bids)
            {
                auctions.TryGetValue(b.AuctionId, out var a);
                wons.TryGetValue(b.AuctionId, out var won);

                var status = b.Status ?? "RECEIVED";
                if (won != null) status = "WON";
                else if (a != null && a.Status == "CLOSED") status = "LOST";

                arr.Add(new JsonObject
                {
                    ["bidId"] = b.Id,
                    ["auctionId"] = b.AuctionId,
                    ["flightNumber"] = a?.FlightNumber ?? "VU-000",
                    ["route"] = a?.Route ?? $"{a?.Origin}-{a?.Destination}",
                    ["aircraft"] = a?.Aircraft ?? "A321F",
                    ["capacityKg"] = a?.CapacityKg ?? 3500,
                    ["priceKg"] = b.PriceKg,
                    ["totalAmountVND"] = b.PriceKg * (b.WeightKg > 0 ? b.WeightKg : (a?.CapacityKg ?? 3500)),
                    ["time"] = b.Time ?? "",
                    ["timestamp"] = b.Timestamp,
                    ["auctionStatus"] = a?.Status ?? "OPEN",
                    ["auctionEndTime"] = a?.EndTime ?? "",
                    ["bidStatus"] = status,
                    ["isWon"] = won != null,
                    ["wonId"] = won?.WonId
                });
            }

            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject
            {
                ["success"] = true,
                ["total"] = arr.Count,
                ["bids"] = arr
            });
        });

        // ---- Agent Won Auctions
        api.MapGet("/agent/won-auctions", async (HttpContext ctx, AppDbContext db) =>
        {
            var agentCode = ctx.Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(agentCode))
            {
                agentCode = ctx.Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant() ?? "";
            }
            if (string.IsNullOrEmpty(agentCode))
            {
                return J(new JsonObject { ["success"] = true, ["wonAuctions"] = new JsonArray(), ["total"] = 0 });
            }

            var wons = await db.WonAuctions.AsNoTracking()
                .Where(w => w.AgentCode != null && w.AgentCode.ToUpper() == agentCode)
                .OrderByDescending(w => w.WonId)
                .ToListAsync();

            var arr = new JsonArray();
            foreach (var w in wons)
            {
                arr.Add(new JsonObject
                {
                    ["wonId"] = w.WonId,
                    ["auctionId"] = w.AuctionId,
                    ["flightNumber"] = w.FlightNumber ?? "VU-000",
                    ["route"] = w.Route ?? "",
                    ["capacityKg"] = w.CapacityKg,
                    ["priceKg"] = w.PriceKg,
                    ["totalAmountVND"] = w.TotalAmountVND,
                    ["paymentDeadline"] = w.PaymentDeadline,
                    ["paymentStatus"] = w.PaymentStatus ?? "UNPAID",
                    ["paidAt"] = w.PaidAt,
                    ["awbNumber"] = w.AwbNumber,
                    ["warehouse"] = w.Warehouse ?? "Kho TCS - Tân Sơn Nhất",
                    ["cutOffTime"] = w.CutOffTime ?? "18:00",
                    ["refundStatus"] = w.RefundStatus ?? "NONE",
                    ["rejectionReason"] = w.RejectionReason
                });
            }

            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject
            {
                ["success"] = true,
                ["total"] = arr.Count,
                ["wonAuctions"] = arr
            });
        });

        // ---- Agent Profile
        api.MapGet("/agent/profile", async (HttpContext ctx, AppDbContext db) =>
        {
            var agentCode = ctx.Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(agentCode))
            {
                agentCode = ctx.Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant() ?? "";
            }
            if (string.IsNullOrEmpty(agentCode)) return Err("Chưa đăng nhập đại lý", 401);

            var agent = ctx.Items["CurrentAgent"] as Agent;
            if (agent == null || !string.Equals(agent.Code, agentCode, StringComparison.OrdinalIgnoreCase))
            {
                agent = await db.Agents.AsNoTracking().FirstOrDefaultAsync(a => a.Code.ToUpper() == agentCode);
            }
            if (agent == null) return Err("Không tìm thấy thông tin đại lý", 404);

            return J(new JsonObject
            {
                ["success"] = true,
                ["agent"] = new JsonObject
                {
                    ["code"] = agent.Code,
                    ["name"] = agent.Name ?? "",
                    ["companyName"] = agent.CompanyName ?? agent.Name ?? "",
                    ["taxCode"] = agent.TaxCode ?? "",
                    ["email"] = agent.Email ?? "",
                    ["phone"] = agent.Phone ?? "",
                    ["status"] = agent.Status ?? "Hoạt động",
                    ["isLocked"] = agent.IsLocked,
                    ["hasPin"] = !string.IsNullOrEmpty(agent.Pin)
                }
            });
        });

        api.MapPost("/agent/profile/update", (HttpContext ctx, AppDbContext db) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var code = (EntityJson.Str(b, "code") ?? ctx.Request.Cookies["cargo_agent_code"] ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(code)) return Err("Thiếu mã đại lý");

            var agent = await db.Agents.FirstOrDefaultAsync(a => a.Code.ToUpper() == code);
            if (agent == null) return Err("Không tìm thấy đại lý", 404);

            var companyName = EntityJson.Str(b, "companyName");
            var taxCode = EntityJson.Str(b, "taxCode");
            var email = EntityJson.Str(b, "email");
            var phone = EntityJson.Str(b, "phone");

            if (!string.IsNullOrEmpty(companyName)) agent.CompanyName = companyName;
            if (!string.IsNullOrEmpty(taxCode)) agent.TaxCode = taxCode;
            if (!string.IsNullOrEmpty(email)) agent.Email = email;
            if (!string.IsNullOrEmpty(phone)) agent.Phone = phone;

            await db.SaveChangesAsync();
            SharedDataService.InvalidateSnapshotCache();

            return J(new JsonObject { ["success"] = true, ["message"] = "Cập nhật thông tin đại lý thành công!" });
        }, log));

        api.MapPost("/agent/profile/documents", (HttpContext ctx, AppDbContext db, SharedDataService shared) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var code = (EntityJson.Str(b, "agentCode") ?? EntityJson.Str(b, "code") ?? ctx.Request.Cookies["cargo_agent_code"] ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(code)) return Err("Thiếu mã đại lý");

            var agent = await db.Agents.FirstOrDefaultAsync(a => a.Code.ToUpper() == code);
            if (agent == null) return Err("Không tìm thấy đại lý", 404);

            var docsArr = b["documents"] as JsonArray ?? new JsonArray();
            EntityJson.SetExtra(agent, "documents", docsArr);

            var matchedReg = await db.Registrations.FirstOrDefaultAsync(r =>
                (r.AgentCode != null && r.AgentCode.ToUpper() == code) ||
                (r.TaxCode != null && agent.TaxCode != null && r.TaxCode == agent.TaxCode));
            if (matchedReg != null)
            {
                matchedReg.Documents = docsArr.ToJsonString();
            }

            db.ActivityLogs.Add(LogService.Make(
                agent.CompanyName ?? agent.Code, agent.Code, "AGENT",
                "Hồ sơ Đại lý", "Bổ sung hồ sơ pháp lý", agent.Code,
                $"Đại lý {agent.CompanyName} ({agent.Code}) đã cập nhật hồ sơ pháp lý đính kèm ({docsArr.Count} tệp).",
                ctx.Connection.RemoteIpAddress?.ToString(), "Web Portal"));

            await shared.BumpVersionAsync();
            await db.SaveChangesAsync();
            SharedDataService.InvalidateSnapshotCache();

            return J(new JsonObject
            {
                ["success"] = true,
                ["documents"] = docsArr,
                ["message"] = "Đã lưu hồ sơ bổ sung thành công!"
            });
        }, log));

        api.MapPost("/agent/profile/change-pin", (HttpContext ctx, AppDbContext db) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var code = (EntityJson.Str(b, "code") ?? ctx.Request.Cookies["cargo_agent_code"] ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(code)) return Err("Thiếu mã đại lý");

            var agent = await db.Agents.FirstOrDefaultAsync(a => a.Code.ToUpper() == code);
            if (agent == null) return Err("Không tìm thấy đại lý", 404);

            var oldPin = EntityJson.Str(b, "oldPin") ?? "";
            var newPin = EntityJson.Str(b, "newPin") ?? "";

            if (!string.IsNullOrEmpty(agent.Pin) && agent.Pin != oldPin)
            {
                return Err("Mã PIN hiện tại không chính xác!");
            }
            if (string.IsNullOrEmpty(newPin) || newPin.Length < 4)
            {
                return Err("Mã PIN mới phải có ít nhất 4 chữ số!");
            }

            agent.Pin = newPin;
            await db.SaveChangesAsync();
            SharedDataService.InvalidateSnapshotCache();

            return J(new JsonObject { ["success"] = true, ["message"] = "Đổi mã PIN bảo mật thành công!" });
        }, log));

        api.MapPost("/agent/profile/change-password", (HttpContext ctx, AppDbContext db) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var code = (EntityJson.Str(b, "code") ?? ctx.Request.Cookies["cargo_agent_code"] ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(code)) return Err("Thiếu mã đại lý");

            var agent = await db.Agents.FirstOrDefaultAsync(a => a.Code.ToUpper() == code);
            if (agent == null) return Err("Không tìm thấy đại lý", 404);

            var oldPass = EntityJson.Str(b, "oldPassword") ?? "";
            var newPass = EntityJson.Str(b, "newPassword") ?? "";

            if (!string.IsNullOrEmpty(agent.Password) && agent.Password != oldPass)
            {
                return Err("Mật khẩu hiện tại không chính xác!");
            }
            if (string.IsNullOrEmpty(newPass) || newPass.Length < 6)
            {
                return Err("Mật khẩu mới phải có ít nhất 6 ký tự!");
            }

            agent.Password = newPass;
            await db.SaveChangesAsync();
            SharedDataService.InvalidateSnapshotCache();

            return J(new JsonObject { ["success"] = true, ["message"] = "Đổi mật khẩu thành công!" });
        }, log));
    }
}

