# Build context is src/, not the API project directory: the API's project references reach
# sideways into five sibling projects, so anything narrower cannot restore.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Project files first, on their own, so the restore layer stays cached until a dependency
# actually changes rather than on every source edit. Only the API's own reference closure is
# copied — the test projects and the Excel importer are not part of what runs.
COPY Pictura.Vita.Api/Pictura.Vita.Api.csproj                       Pictura.Vita.Api/
COPY Pictura.Vita.Data/Pictura.Vita.Data.csproj                     Pictura.Vita.Data/
COPY Pictura.Vita.Domain/Pictura.Vita.Domain.csproj                 Pictura.Vita.Domain/
COPY Pictura.Vita.Domain.Extensions/Pictura.Vita.Domain.Extensions.csproj Pictura.Vita.Domain.Extensions/
COPY Pictura.Vita.Messaging/Pictura.Vita.Messaging.csproj           Pictura.Vita.Messaging/
COPY Pictura.Vita.Utility/Pictura.Vita.Utility.csproj               Pictura.Vita.Utility/
RUN dotnet restore Pictura.Vita.Api/Pictura.Vita.Api.csproj

COPY . .
RUN dotnet publish Pictura.Vita.Api/Pictura.Vita.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .

# HTTP only. The container is reached through a port Compose publishes on loopback, and
# terminating TLS in here would mean a certificate to generate, trust and rotate for a hop
# that never leaves the machine.
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

# No DATA_FILE_PATH default on purpose. An image that guesses where your timeline lives is
# an image that can create an empty one somewhere you did not mean; the API already fails at
# startup with an explicit message when the variable is unset, which is the better outcome.

ENTRYPOINT ["dotnet", "Pictura.Vita.Api.dll"]
