using System.Security.Cryptography;
using System.Text;

namespace Pictura.Vita.Utility;

/// <summary>
/// Derives a GUID from a name, RFC 9562 version 5 (SHA-1, name-based).
///
/// Import pipelines need identifiers that survive being re-run: minting a fresh
/// <c>Guid.CreateVersion7()</c> on every pass makes each import look like an entirely new
/// set of records, so nothing downstream can be reconciled with what came before.
/// </summary>
public static class DeterministicGuid
{
    /// <summary>Namespace for identifiers derived from imported spreadsheet rows.</summary>
    public static readonly Guid ImportNamespace = new("6f9c4d2a-1b3e-4c5f-9a7d-8e0f1a2b3c4d");

    public static Guid Create(Guid namespaceId, string name)
    {
        var namespaceBytes = namespaceId.ToByteArray(bigEndian: true);
        var nameBytes = Encoding.UTF8.GetBytes(name);

        var buffer = new byte[namespaceBytes.Length + nameBytes.Length];
        namespaceBytes.CopyTo(buffer, 0);
        nameBytes.CopyTo(buffer, namespaceBytes.Length);

        var hash = SHA1.HashData(buffer);

        var guidBytes = hash[..16];
        guidBytes[6] = (byte)((guidBytes[6] & 0x0F) | 0x50); // version 5
        guidBytes[8] = (byte)((guidBytes[8] & 0x3F) | 0x80); // RFC variant

        return new Guid(guidBytes, bigEndian: true);
    }
}
