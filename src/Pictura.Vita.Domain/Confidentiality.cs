namespace Pictura.Vita.Domain;

/// <summary>
/// The confidentiality of timeline items, which affects when they are displayed.
///
/// Values:
///
/// Inherit: 0
/// Public: 1
/// Friends: 2
/// OnlyMe: 3
///
/// </summary>
public enum Confidentiality
{
    Inherit = 0,
    Public = 1,
    Friends = 2,
    OnlyMe = 3
}
