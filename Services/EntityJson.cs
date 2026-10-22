using System.Collections.Concurrent;
using System.Globalization;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;

namespace BiddingCargo.Web.Services;

/// <summary>
/// Ánh xạ hai chiều entity &lt;-&gt; JsonObject theo "hợp đồng JSON" mà client (cargo-store.js) đang dùng.
/// Các trường client gửi lên nhưng không có cột riêng (vd. agentName, etdIso của đơn thắng thầu) được giữ
/// trong cột extra_json và trả lại nguyên vẹn khi đọc, giống hành vi lưu JSON tự do của bản Node.js.
/// </summary>
public static class EntityJson
{
    private sealed class Meta
    {
        public List<PropertyInfo> Props = new();
        public Dictionary<string, PropertyInfo> ByKey = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, PropertyInfo> JsonValued = new(StringComparer.OrdinalIgnoreCase);
        public PropertyInfo? Extra;
    }

    // Cột lưu chuỗi JSON nhưng client thấy là object/array
    private static readonly Dictionary<(Type, string), string> JsonValuedMap = new()
    {
        [(typeof(WonAuction), "CargoDeclarationJson")] = "cargoDeclaration",
        [(typeof(WonAuction), "RefundBankInfoJson")] = "refundBankInfo",
        [(typeof(WonAuction), "PaymentProofJson")] = "paymentProof",
        [(typeof(Registration), "Documents")] = "documents",
        [(typeof(Auction), "AllowedAgentsJson")] = "allowedAgents",
    };

    private static readonly ConcurrentDictionary<Type, Meta> Cache = new();

    private static Meta GetMeta(Type t) => Cache.GetOrAdd(t, Build);

    private static Meta Build(Type t)
    {
        var m = new Meta();
        foreach (var p in t.GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            if (!p.CanRead || !p.CanWrite) continue;
            if (p.Name == "ExtraJson") { m.Extra = p; continue; }
            if (JsonValuedMap.TryGetValue((t, p.Name), out var jk)) { m.JsonValued[jk] = p; continue; }
            m.Props.Add(p);
            m.ByKey[JsonNamingPolicy.CamelCase.ConvertName(p.Name)] = p;
        }
        return m;
    }

    public static JsonObject ToNode(object e)
    {
        var m = GetMeta(e.GetType());
        var o = new JsonObject();
        foreach (var p in m.Props)
            o[JsonNamingPolicy.CamelCase.ConvertName(p.Name)] = ToJsonValue(p.GetValue(e));

        foreach (var kv in m.JsonValued)
        {
            var s = kv.Value.GetValue(e) as string;
            if (string.IsNullOrWhiteSpace(s)) o[kv.Key] = kv.Key == "documents" ? new JsonArray() : null;
            else
            {
                try { o[kv.Key] = JsonNode.Parse(s); }
                catch (JsonException) { o[kv.Key] = kv.Key == "documents" ? new JsonArray() : null; }
            }
        }

        if (m.Extra?.GetValue(e) is string ex && ex.Length > 0)
        {
            try
            {
                if (JsonNode.Parse(ex) is JsonObject eo)
                {
                    foreach (var kv in eo.ToList())
                    {
                        if (o.ContainsKey(kv.Key)) continue;
                        eo.Remove(kv.Key);
                        o[kv.Key] = kv.Value;
                    }
                }
            }
            catch (JsonException) { /* bỏ qua extra hỏng */ }
        }
        return o;
    }

    public static void Apply(object e, JsonObject src)
    {
        var m = GetMeta(e.GetType());
        JsonObject extras = new();
        if (m.Extra?.GetValue(e) is string old && old.Length > 0)
        {
            try { if (JsonNode.Parse(old) is JsonObject oo) extras = oo; } catch (JsonException) { }
        }

        foreach (var kv in src.ToList())
        {
            if (kv.Key.Equals("extraJson", StringComparison.OrdinalIgnoreCase)) continue;
            if (m.ByKey.TryGetValue(kv.Key, out var p)) SetProp(e, p, kv.Value);
            else if (m.JsonValued.TryGetValue(kv.Key, out var jp))
            {
                var isNull = kv.Value == null || kv.Value.GetValueKind() == JsonValueKind.Null;
                jp.SetValue(e, isNull ? null : kv.Value!.ToJsonString());
            }
            else if (m.Extra != null) extras[kv.Key] = kv.Value?.DeepClone();
        }
        if (m.Extra != null) m.Extra.SetValue(e, extras.Count > 0 ? extras.ToJsonString() : null);
    }

    public static string? GetExtraString(object e, string key)
    {
        var m = GetMeta(e.GetType());
        if (m.Extra?.GetValue(e) is not string ex || ex.Length == 0) return null;
        try
        {
            if (JsonNode.Parse(ex) is JsonObject eo && eo.TryGetPropertyValue(key, out var v) && v != null)
                return v.GetValueKind() == JsonValueKind.String ? v.GetValue<string>() : v.ToJsonString();
        }
        catch (JsonException) { }
        return null;
    }

    public static void SetExtra(object e, string key, JsonNode? value)
    {
        var m = GetMeta(e.GetType());
        if (m.Extra == null) return;
        JsonObject eo = new();
        if (m.Extra.GetValue(e) is string ex && ex.Length > 0)
        {
            try { if (JsonNode.Parse(ex) is JsonObject o) eo = o; } catch (JsonException) { }
        }
        eo[key] = value;
        m.Extra.SetValue(e, eo.ToJsonString());
    }

    private static JsonNode? ToJsonValue(object? v) => v switch
    {
        null => null,
        string s => JsonValue.Create(s),
        bool b => JsonValue.Create(b),
        int i => JsonValue.Create(i),
        long l => JsonValue.Create(l),
        double d => JsonValue.Create(d),
        _ => JsonValue.Create(v.ToString())
    };

    private static void SetProp(object e, PropertyInfo p, JsonNode? n)
    {
        var under = Nullable.GetUnderlyingType(p.PropertyType);
        var t = under ?? p.PropertyType;
        var nullable = !p.PropertyType.IsValueType || under != null;

        if (n == null || n.GetValueKind() == JsonValueKind.Null)
        {
            if (nullable) p.SetValue(e, null);
            return;
        }

        object? val;
        if (t == typeof(string))
            val = n.GetValueKind() == JsonValueKind.String ? n.GetValue<string>() : n.ToJsonString();
        else if (t == typeof(bool))
            val = ToBool(n);
        else if (t == typeof(int))
        {
            var l = ToLong(n); if (l == null) return; val = (int)l.Value;
        }
        else if (t == typeof(long))
        {
            var l = ToLong(n); if (l == null) return; val = l.Value;
        }
        else if (t == typeof(double))
        {
            var l = ToDouble(n); if (l == null) return; val = l.Value;
        }
        else return;

        p.SetValue(e, val);
    }

    private static string Raw(JsonNode n) =>
        n.GetValueKind() == JsonValueKind.String ? n.GetValue<string>() : n.ToJsonString();

    public static long? ToLong(JsonNode? n)
    {
        if (n == null) return null;
        var s = Raw(n);
        if (long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var l)) return l;
        if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) && !double.IsNaN(d) && !double.IsInfinity(d))
            return (long)Math.Round(d);
        return null;
    }

    public static double? ToDouble(JsonNode? n)
    {
        if (n == null) return null;
        return double.TryParse(Raw(n), NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : null;
    }

    public static bool ToBool(JsonNode n) => n.GetValueKind() switch
    {
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Number => (ToDouble(n) ?? 0) != 0,
        JsonValueKind.String => Raw(n).Trim().ToLowerInvariant() is "true" or "1" or "yes",
        _ => false
    };

    /// <summary>Giá trị scalar của một JsonNode dưới dạng chuỗi (null nếu JSON null).</summary>
    public static string? NodeStr(JsonNode? n)
    {
        if (n == null || n.GetValueKind() == JsonValueKind.Null) return null;
        return n.GetValueKind() == JsonValueKind.String ? n.GetValue<string>() : n.ToJsonString();
    }

    // Tiện ích đọc nhanh từ JsonObject
    public static string? Str(JsonNode? o, string key)
    {
        if (o is not JsonObject jo || !jo.TryGetPropertyValue(key, out var v) || v == null) return null;
        if (v.GetValueKind() == JsonValueKind.Null) return null;
        return v.GetValueKind() == JsonValueKind.String ? v.GetValue<string>() : v.ToJsonString();
    }

    public static long? Lng(JsonNode? o, string key) =>
        o is JsonObject jo && jo.TryGetPropertyValue(key, out var v) ? ToLong(v) : null;

    public static bool? Bool(JsonNode? o, string key) =>
        o is JsonObject jo && jo.TryGetPropertyValue(key, out var v) && v != null && v.GetValueKind() != JsonValueKind.Null ? ToBool(v) : null;
}
